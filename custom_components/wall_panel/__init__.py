"""Wall Panel — a lightweight touch UI for Home Assistant.

This one small integration does everything needed to run Wall Panel:

  1. Serves the panel's front-end bundle (``wall-panel.js``, shipped alongside
     this file) at a stable URL, so there is nothing to copy into ``/config/www``.
  2. Registers the sidebar panel itself (no ``panel_custom:`` YAML), so after a
     restart "Wall Panel" simply appears in the sidebar.
  3. Stores ONE configuration for the whole household (not per-user) via two
     websocket commands, so every tablet, phone and guest shares the same setup
     and new devices need no configuration:

         wall_panel/get                       -> { "value": <stored config or null> }
         wall_panel/set  ({ "value": {...} })  -> { "ok": true }

The config lives in Home Assistant's own storage (``.storage/wall_panel_config``),
so it is shared across every user and device and survives restarts. No cloud, no
token, no polling. Any authenticated user can read and write it — access to the
editing UI is gated in the panel itself (admin or PIN). When one device saves,
a ``wall_panel_updated`` event is fired so other open panels update live.

Install is via HACS (add as a custom repository, category "Integration") or by
copying this folder to ``<config>/custom_components/``. Either way, no YAML.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components import panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType

DOMAIN = "wall_panel"
STORAGE_KEY = "wall_panel_config"
STORAGE_VERSION = 1

# Where the front-end bundle is served and the sidebar panel's URL.
_BUNDLE = "wall-panel.js"
STATIC_URL = f"/{DOMAIN}_frontend/{_BUNDLE}"
PANEL_URL_PATH = "wall-panel"
WEBCOMPONENT = "wall-panel"
SIDEBAR_TITLE = "Wall Panel"
SIDEBAR_ICON = "mdi:tablet-dashboard"

# Read our own version so the served URL is cache-busted on every update.
_MANIFEST = json.loads((Path(__file__).parent / "manifest.json").read_text(encoding="utf-8"))
VERSION = str(_MANIFEST.get("version", "0"))

# No YAML config keys; presence of `wall_panel:` (or a HACS/UI install) is enough.
CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Schema({})}, extra=vol.ALLOW_EXTRA)


async def _async_setup_common(hass: HomeAssistant) -> None:
    """Serve the bundle, register the panel, and wire the shared config store.

    Safe to call once per start. Guarded so a YAML + UI double-setup can't
    register the panel or the websocket commands twice.
    """
    if hass.data.get(DOMAIN, {}).get("_ready"):
        return

    # 1) Shared household config store.
    store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    data = await store.async_load() or {}
    hass.data[DOMAIN] = {"store": store, "data": data, "_ready": True}

    websocket_api.async_register_command(hass, websocket_get)
    websocket_api.async_register_command(hass, websocket_set)

    # 2) Serve the front-end bundle that sits next to this file.
    js_path = str(Path(__file__).parent / _BUNDLE)
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL, js_path, cache_headers=True)]
    )

    # 3) Register the sidebar panel pointing at that bundle. The `?v=` query
    #    busts the browser cache whenever the integration is updated.
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=WEBCOMPONENT,
        module_url=f"{STATIC_URL}?v={VERSION}",
        sidebar_title=SIDEBAR_TITLE,
        sidebar_icon=SIDEBAR_ICON,
        require_admin=False,  # family/guests use it; editing is PIN-gated in-app
        embed_iframe=False,
        trust_external=False,
    )


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up from `wall_panel:` in configuration.yaml (optional)."""
    await _async_setup_common(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up from a UI config entry (how HACS/users add it without YAML)."""
    await _async_setup_common(hass)
    return True


@websocket_api.websocket_command({vol.Required("type"): "wall_panel/get"})
@websocket_api.async_response
async def websocket_get(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the shared config, or null when nothing is stored yet."""
    data = hass.data[DOMAIN]["data"]
    connection.send_result(msg["id"], {"value": data.get("value")})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "wall_panel/set",
        vol.Required("value"): dict,
        # Optional id of the device that saved, so it can ignore its own echo.
        vol.Optional("origin"): vol.Any(str, None),
    }
)
@websocket_api.async_response
async def websocket_set(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Replace the shared config, persist it, and notify other open panels."""
    bucket = hass.data[DOMAIN]
    bucket["data"] = {"value": msg["value"]}
    await bucket["store"].async_save(bucket["data"])
    connection.send_result(msg["id"], {"ok": True})
    # Push the new config to every other open panel so they update live. The
    # saver's own panel ignores the echo by matching `origin`.
    hass.bus.async_fire(
        f"{DOMAIN}_updated",
        {"value": msg["value"], "origin": msg.get("origin")},
    )

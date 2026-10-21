"""Config flow for Wall Panel.

There is nothing to configure — the flow exists only so the integration can be
added from the Home Assistant UI (Settings → Devices & Services → Add
Integration → "Wall Panel") instead of editing YAML. Only one instance is
allowed; the shared config store is global.
"""
from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigFlow

from . import DOMAIN, SIDEBAR_TITLE


class WallPanelConfigFlow(ConfigFlow, domain=DOMAIN):
    """Single-step, single-instance flow with no user input."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> Any:
        """Create the entry straight away (one instance only)."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is None:
            # Show a tiny confirm step so the user can press Submit.
            return self.async_show_form(step_id="user")
        return self.async_create_entry(title=SIDEBAR_TITLE, data={})

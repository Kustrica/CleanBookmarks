# Changelog

1.2
- Interface language selector in the Options header, as in Workspaces and Highlight Opened Tabs: Auto (browser language) or any of the 19 languages. The chosen language is applied to the Options page and to the "Add bookmark" context menu item, without restarting Firefox.
- Redesigned Options page: dark cards in the same style as the other extensions, a live before/after example, and clear descriptions for every setting.
- New settings:
  - Also hide titles that repeat the address (turn off to hide only empty titles).
  - Check new and renamed bookmarks automatically.
  - Check all bookmarks when Firefox starts (and after install/update).
  - Show or hide the "Add bookmark" context menu item.
  - Where quick-added bookmarks go in a folder: at the end or at the top.
  - Save quick-added bookmarks as icon only.
- "Hide now" reports how many titles were hidden; the page shows how many bookmarks are icon-only.
- New "Restore titles" action: gives icon-only bookmarks a visible title again (the site address, e.g. github.com/Kustrica) after a confirmation, and turns automatic checks off so the titles stay visible.
- "Add bookmark" on a bookmark (not a folder) now saves the tab right after that bookmark instead of at the end of its folder.
- Added scripts/check-locales.js to validate all locales.

1.1
- Quick "Add bookmark" item in the bookmark context menu.
- Icon-only view for bookmarks with empty or URL-like titles.

# Future Enhancements

## Full Controller Modal

**Goal:** Make the modal form a comprehensive music controller with all functions and controls available in one place.

**Current State:**
- "Play Song" modal only has search bar and priority option
- Other functions (skip, pause, queue, etc.) are separate context menu items

**Proposed Enhancement:**
Create a single "Music Controller" modal that includes:
- 🎵 Search/Play input field
- ⏭️ Skip button
- ⏸️/▶️ Pause/Resume toggle
- 📋 Queue display (scrollable list)
- 📻 Radio mode toggle
- 🔀 Shuffle option
- 🔁 Loop/Repeat options
- 🔊 Volume control (if supported)
- ⏮️ Previous track
- 🎚️ Crossfade settings

**Implementation Notes:**
- Discord modals support up to 5 ActionRows with TextInput or SelectMenu components
- For buttons, would need to use a message with components instead of a modal
- Alternative: Modal for input + follow-up message with button controls
- Could use Select Menus for quick song selection from queue

**Design Options:**

### Option A: Hybrid Approach
1. Right-click → "Music Controller"
2. Modal appears with search input
3. After submitting, bot sends a persistent message with control buttons

### Option B: Persistent Dashboard
1. Slash command `/controller` sends a persistent message
2. Message has buttons for all controls
3. Buttons stay in channel for easy access

### Option C: DM Control Panel
1. When user DMs bot, automatically send control panel
2. Persistent message in DM with all buttons
3. Updates in real-time as queue changes

**Priority:** Medium
**Complexity:** Medium
**User Benefit:** High - Single interface for all music controls

---

## Other Ideas
- [ ] Playlist management (save/load custom playlists)
- [ ] Voting system for skipping songs
- [ ] Song requests queue with user attribution
- [ ] Lyrics display
- [ ] Now playing with album art
- [ ] DJ role permissions
- [ ] Per-server radio preferences

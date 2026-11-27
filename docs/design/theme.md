# Dashboard theme variables

The dashboard has no UI library. All colour comes from CSS custom properties defined once in `apps/dashboard/src/app/globals.css`, with a light set on `:root` and a dark set under `@media (prefers-color-scheme: dark)`. The reference mockups are `dashboard-mockup.html` (Overview) and `tasks-mockup.html` (Tasks); they use these token names, so a mockup snippet can be pasted into a page with its names unchanged.

| Token | Use |
| --- | --- |
| `--bg`, `--surface`, `--surface-2` | Page background, top bar and table surface, card surface |
| `--border` | 1px hairlines and card outlines |
| `--text`, `--text-secondary` | Body text, captions and labels |
| `--text-accent`, `--bg-accent` | Info pills, in-progress cards, filled progress bars |
| `--text-success`, `--bg-success` | Healthy, online, done |
| `--text-warning`, `--bg-warning` | Needs attention: partial, degraded, privileged, client data |
| `--text-danger`, `--bg-danger` | Failed, down, destructive, error cards |
| `--bg-neutral` | Stat tiles, neutral pills, bar tracks |
| `--fill-ghost-selected` | Selected filter chip |
| `--accent`, `--accent-text` | Primary buttons and focus ring |
| `--radius`, `--radius-lg` | Small elements, cards |

Legacy names (`--muted`, `--ok-bg`, `--ok-fg`, `--warn-*`, `--bad-*`, `--neutral-*`, `--info-*`) are aliases of the tokens above and are used by the older table pages. Prefer the mockup names in new code.

## Rules

- Every foreground and background pair must keep at least 4.5:1 contrast in both themes (text is 11 to 13 px). Check both sets when changing a value.
- Never use colour alone. Pills always carry a text label; meters print their value; privacy is a text tag.
- Components: `.pill` with `ok`, `warn`, `info`, `bad` or `ne`; `.card`; `.row`; `.bar` (add `warn` or `bad`); `.tile`; `.chip`. Layout is a CSS grid that falls to two columns at 860 px and one at phone width.
- Dark mode follows the operating system. There is no manual toggle in the lite track.

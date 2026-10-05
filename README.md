# ColorWheel

A Claude Code mod that redraws assistant replies in Claude Code Desktop:

- text, lists and tables through the app's own markdown renderer, so they keep its typography, wrap to the chat width and follow light and dark mode
- code blocks in the app's native code view
- GitHub alerts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) as rounded cards in a tone that reads on both themes
- mermaid flowcharts, state, sequence diagrams and `xychart-beta` charts as full-width SVG in the ColorWheel palette, switching with `prefers-color-scheme`, each with **Open large** (zoom 100–600% with panning) and **Copy source**; class and ER diagrams draw as monospace box art

The terminal keeps Claude Code's own renderer. `/colorwheel` shows every element.

## Install

```
claude plugin marketplace add <path to this folder>
claude plugin install colorwheel@colorwheel --scope user
```

## Develop

```
npm --prefix scripts install
npm --prefix scripts run build:vendor
claude plugin validate .
claude plugin test .
```

The engine refuses modules over 1 MiB, so the vendor build bundles only beautiful-mermaid's elk-free pipelines and fails if the bundle grows past that. Flowcharts are laid out by `hooks/layout.ts`.

## License

MIT. Bundles [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) (MIT).

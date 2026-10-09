# Diagrams

Checked-in **diagram-as-code** sources, rendered in the shared Eraser workspace
[**LearnSphere - System Architecture**](https://app.eraser.io/workspace/Zfyiyz8AGmaMFIVamHE9).

These files are the source of truth. Eraser is the renderer, not the store — so
a diagram change reviews in a pull request like any other change, and survives
losing access to the tool.

| File | Eraser diagram type | Title on the canvas |
|---|---|---|
| `01-system-architecture.eraser` | Cloud Architecture | LearnSphere - Target System Architecture |
| `02-current-topology.eraser` | Cloud Architecture | LearnSphere - Current Local Topology |
| `03-video-pipeline.eraser` | Sequence | Video Upload - Presign to HLS Playback |
| `04-purchase-flow.eraser` | Sequence | Purchase - Order to Enrolment to Receipt |
| `05-notification-delivery.eraser` | Flow Chart | Notification Delivery |
| `06-order-state-machine.eraser` | Flow Chart | Order and Payment State Machines |
| `07-data-model.eraser` | Entity Relationship | LearnSphere Data Model |
| `08-service-split.eraser` | Cloud Architecture | Service Split - Today vs Target |

## Which diagram answers which question

| Question | Diagram |
|---|---|
| What are we building towards? | 01 |
| What actually runs right now? | 02 |
| How does a video get from a browser to adaptive playback? | 03 |
| How does money become an enrolment? | 04 |
| Why did my email not arrive? | 05 |
| Why is this order in this state? | 06 |
| Where does this data live, and who may write it? | 07 |
| What changes when `backend` splits? | 08 |

## Editing

1. Edit the `.eraser` file here. Keep the comment header — it records what the
   diagram is grounded in.
2. Copy it to the clipboard: `pbcopy < 0X-whatever.eraser`
3. In Eraser, switch to **Canvas**, click the diagram's title to select it, click
   **Code Editor**, then select all in the editor pane and paste.

To add a new diagram: **Insert** (`+`, or `/`) → **Diagram as Code** → pick the
type → click an empty spot on the canvas → paste into the code editor that
opens. Add it to the table above and to the index in Eraser's **Document** pane.

> Make sure nothing is selected before clicking `+` — when a diagram is
> selected, that toolbar button becomes "deselect" instead of "Insert", and the
> menu clicks land somewhere unintended.

## Syntax notes learned the hard way

- **`Order` is reserved in sequence diagrams.** A participant named `Order`
  produces `Syntax error: Invalid arrow or line type` on every line that
  mentions it. `04` uses `OrderSvc`. Suspect a reserved word whenever a line
  errors for no visible reason.
- Comments are `//`. `title <text>` sets the diagram name on the canvas.
- Sequence: `A > B: msg` solid, `A --> B: msg` dashed, `A <> B` bidirectional,
  `A - B` plain line. `autoNumber on` numbers the steps. `activate`/`deactivate`
  and `loop [label: "…"] { }` are supported.
- Cloud architecture: `Name [icon: aws-s3, color: blue]`, groups as
  `Group [color: x] { … }`, and connections may target a **group**, not just a
  node (`08` relies on that for `Today > Target`).
- Entity relationship: `table { col type pk }`, relations as
  `a.col > b.col` (many-to-one), `<` one-to-many, `-` one-to-one.
- Flow chart: `shape: oval | diamond | rectangle`, and `direction right`.
- An unrecognised `icon:` renders the node without an icon rather than failing —
  so a missing icon is cosmetic, but check the canvas rather than assuming.

## Keeping them honest

Each source file's header comment names what it was verified against. When the
code moves, the diagram is stale — the ones most likely to drift are:

- **02** — the current topology, by definition
- **07** — any Prisma schema change
- **01 / 08** — anything about the `course-service` split

Treat a diagram like a doc comment: if you change the thing it describes and do
not change it, you have left something false behind.

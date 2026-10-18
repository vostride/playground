# Native acceptance

Run on the GitHub-built APK and zipped iOS simulator app. TypeScript/Metro checks do not prove native runtime behavior. These checks are required before declaring a mobile release verified.

- Fresh launch: Playground opens without a network connection, permission prompt or sign-in requirement. Every screen and modal shows the playground notice.
- Navigation: open each of Fernwood, Wayline, Corkboard and Vigil from Home. Exercise bottom tabs, back navigation, Android hardware back and the offline WebView guide.
- Deep links: open `playground://shop`, `playground://flights`, `playground://tasks`, `playground://observability`; also open each app's nested routes and an explicit `?bug=<id>` link.
- Fernwood: sign in with the printed demo credentials, find Everyday Ceramic Mug, add two, verify $48 subtotal/$53 standard total. Reject incomplete shipping. Complete delivery/review, place order, view orders, cancel. Pull to refresh the catalog, scroll through the long list, operate detail sheets and fields with the keyboard open.
- Wayline: choose airports, dates and travelers; search; filter/sort and compare date prices; choose outward/return flights, fare and available seats. Reject occupied seats and invalid traveler/payment data. Confirm, view and cancel a booking; update seats.
- Corkboard: choose boards, search/filter, create and edit a card, set labels/assignees/due date, complete checklist items. Long-press and drag within and across columns, undo, use the accessible move controls, scroll long lists and refresh. Verify a card deep link opens its details.
- Vigil: change time range and live state; query logs, apply facets, scroll the long log list and refresh; open log details and its trace, inspect waterfall spans. Validate, create, pause, edit and delete a monitor.
- Bugs: enable each labelled switch individually, confirm the documented failure, disable it and confirm normal behavior. The reset control must clear all app changes and bug switches.
- Restart: force-stop and relaunch. The fixed initial data and baseline simulated timestamps must match a fresh install.

Record device/OS, artifact hash, result and any failure evidence before promoting a mobile entry in the registry. Do not mark these checks complete solely from successful source compilation or JS bundling.

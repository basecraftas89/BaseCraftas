# Published runtime

This directory records the confirmed public Worker runtime. It is the entry used by Git content builds so an article publish/unpublish cannot replace the current runtime with the old base Worker.

Source: production version 4fff8028-1c4a-46de-928f-58caf7712004, 2026-10-18 JST. It includes the approved Gantt category and time-scale buttons. Binary modules are the unchanged existing production media modules. No credentials or secret binding values are included.

After a server/runtime change, refresh this directory from the verified live Worker in the same release. Keep all existing modules and service bindings, run scripts/public-release-guard.mjs --source, and check the current production deployment before publishing. Content data remains in the normal public trees and is rebuilt independently.

This is a deployment artifact. Editable feature sources remain in apps/site-worker and apps/tsuzuri-studio. Do not overwrite this directory from an older local build.

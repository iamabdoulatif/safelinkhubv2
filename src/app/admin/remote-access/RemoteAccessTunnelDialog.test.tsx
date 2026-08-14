import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import RemoteAccessTunnelDialog from "./RemoteAccessTunnelDialog";

test("expose le déclencheur d’installation sans rendre le dialogue fermé", () => {
  const markup = renderToStaticMarkup(<RemoteAccessTunnelDialog />);
  assert.match(markup, /Installer un tunnel/);
  assert.doesNotMatch(markup, /tunnel-dialog-title/);
});

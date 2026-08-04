import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import RoutersTable from "./RoutersTable";

const router = {
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

test("la vue ciblée conserve son CTA de liaison lorsque les actions de parc sont masquées", () => {
  const markup = renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value="/admin/router">
        <SearchParamsContext.Provider value={new URLSearchParams()}>
          <RoutersTable routers={[]} showFleetActions={false} />
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );

  assert.equal((markup.match(/Lier un MikroTik/g) ?? []).length, 1);
  assert.doesNotMatch(markup, /Sauvegardes/);
});

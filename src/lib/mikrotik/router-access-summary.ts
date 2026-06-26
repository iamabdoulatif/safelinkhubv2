type RouterSentence = Record<string, string | undefined>;

export type RouterAccessSummary = {
  identity: string;
  wanInterface: string;
  wanMacAddress: string;
  wanIpAddress: string;
  tunnelIp: string;
  defaultGateway: string;
};

export function buildRouterAccessSummary({
  routerName,
  tunnelIp,
  identityRows,
  addressRows,
  interfaceRows,
  routeRows,
}: {
  routerName: string;
  tunnelIp: string | null;
  identityRows: RouterSentence[];
  addressRows: RouterSentence[];
  interfaceRows: RouterSentence[];
  routeRows: RouterSentence[];
}): RouterAccessSummary {
  const defaultRoute = routeRows.find((row) => row["dst-address"] === "0.0.0.0/0");
  const wanAddress =
    addressRows.find((row) => row.interface === "E1-WAN-FAI") ??
    addressRows.find((row) => row.dynamic === "true" && row.interface);
  const wanInterface = wanAddress?.interface ?? "E1-WAN-FAI";
  const wanInterfaceRow = interfaceRows.find((row) => row.name === wanInterface);

  return {
    identity: identityRows[0]?.name ?? routerName,
    wanInterface: wanAddress?.interface ?? "",
    wanMacAddress: wanInterfaceRow?.["mac-address"] ?? "",
    wanIpAddress: stripPrefix(wanAddress?.address),
    tunnelIp: tunnelIp ?? "",
    defaultGateway: defaultRoute?.gateway ?? "",
  };
}

function stripPrefix(address: string | undefined) {
  return address?.split("/")[0] ?? "";
}

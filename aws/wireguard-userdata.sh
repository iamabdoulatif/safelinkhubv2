#!/bin/bash
set -euo pipefail

apt-get update -y
apt-get install -y wireguard wireguard-tools qrencode iptables-persistent

mkdir -p /etc/wireguard
cd /etc/wireguard
umask 077

wg genkey | tee server_private.key | wg pubkey > server_public.key
SERVER_PRIV=$(cat server_private.key)
SERVER_PUB=$(cat server_public.key)

IFACE=$(ip route | awk '/default/ {print $5; exit}')

cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = 10.66.0.1/24
ListenPort = 51820
PrivateKey = ${SERVER_PRIV}
PostUp = iptables -t nat -A POSTROUTING -o ${IFACE} -j MASQUERADE
PostDown = iptables -t nat -D POSTROUTING -o ${IFACE} -j MASQUERADE
SaveConfig = true
EOF

echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-safelinkhub-wireguard.conf
sysctl -p /etc/sysctl.d/99-safelinkhub-wireguard.conf

systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0

# Helper to add a MikroTik router as a new peer.
# Usage: safelinkhub-add-peer.sh <peer-name>
cat > /usr/local/bin/safelinkhub-add-peer.sh <<'SCRIPT'
#!/bin/bash
set -euo pipefail
NAME="${1:?Usage: safelinkhub-add-peer.sh <peer-name>}"
cd /etc/wireguard

LAST_OCTET=$(grep -oP '10\.66\.0\.\K[0-9]+' wg0.conf | sort -n | tail -1 || echo 1)
NEXT_OCTET=$((LAST_OCTET + 1))
PEER_IP="10.66.0.${NEXT_OCTET}/32"

PEER_PRIV=$(wg genkey)
PEER_PUB=$(echo "$PEER_PRIV" | wg pubkey)
SERVER_PUB=$(cat server_public.key)
SERVER_IP=$(curl -s https://checkip.amazonaws.com)

wg set wg0 peer "$PEER_PUB" allowed-ips "$PEER_IP"

echo "# Peer: ${NAME}"
echo "PeerPublicKey = ${PEER_PUB}"
echo "[Interface]"
echo "PrivateKey = ${PEER_PRIV}"
echo "Address = ${PEER_IP}"
echo ""
echo "[Peer]"
echo "PublicKey = ${SERVER_PUB}"
echo "Endpoint = ${SERVER_IP}:51820"
echo "AllowedIPs = 10.66.0.0/24"
echo "PersistentKeepalive = 25"
SCRIPT
chmod +x /usr/local/bin/safelinkhub-add-peer.sh

echo "WireGuard server public key: ${SERVER_PUB}" > /etc/wireguard/server_info.txt

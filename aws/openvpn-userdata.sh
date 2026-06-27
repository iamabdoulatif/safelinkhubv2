#!/bin/bash
# Provisions an OpenVPN server on the SafeLinkHub VPN relay, alongside the
# WireGuard server set up by wireguard-userdata.sh. Routers connect to this
# as OpenVPN *clients* (RouterOS /interface/ovpn-client) using a per-router
# username/password — no client certificates needed. The relay reaches
# routers over the resulting 10.67.0.0/24 tunnel subnet the same way it
# already reaches WireGuard peers on 10.66.0.0/24 (see relay.ts openRouterTunnel).
#
# Remember to also open inbound UDP 1194 on the relay's security group.
set -euo pipefail

apt-get update -y
apt-get install -y openvpn easy-rsa

EASYRSA_DIR=/etc/openvpn/easy-rsa
rm -rf "$EASYRSA_DIR"
mkdir -p "$EASYRSA_DIR"
cp -r /usr/share/easy-rsa/. "$EASYRSA_DIR/"
cd "$EASYRSA_DIR"

./easyrsa init-pki
echo | ./easyrsa --batch build-ca nopass
./easyrsa --batch build-server-full server nopass
./easyrsa gen-dh

mkdir -p /etc/openvpn/server /etc/openvpn/ccd /etc/openvpn/users
cp pki/ca.crt pki/issued/server.crt pki/private/server.key pki/dh.pem /etc/openvpn/server/

IFACE=$(ip route | awk '/default/ {print $5; exit}')

cat > /etc/openvpn/checkpsw.sh <<'SCRIPT'
#!/bin/bash
# OpenVPN auth-user-pass-verify script (via-file): $1 is a temp file with
# the username on line 1 and the password on line 2.
set -euo pipefail
CLIENTFILE="$1"
USERNAME=$(sed -n '1p' "$CLIENTFILE")
PASSWORD=$(sed -n '2p' "$CLIENTFILE")

if [[ ! "$USERNAME" =~ ^[a-zA-Z0-9@._-]+$ ]]; then
  exit 1
fi

PASSFILE="/etc/openvpn/users/${USERNAME}.pass"
if [[ -f "$PASSFILE" ]] && [[ "$(cat "$PASSFILE")" == "$PASSWORD" ]]; then
  exit 0
fi
exit 1
SCRIPT
chmod 700 /etc/openvpn/checkpsw.sh

cat > /etc/openvpn/server.conf <<EOF
port 1194
proto udp
dev tun
ca /etc/openvpn/server/ca.crt
cert /etc/openvpn/server/server.crt
key /etc/openvpn/server/server.key
dh /etc/openvpn/server/dh.pem
topology subnet
server 10.67.0.0 255.255.255.0
client-config-dir /etc/openvpn/ccd
username-as-common-name
data-ciphers AES-256-GCM:AES-128-GCM
data-ciphers-fallback AES-256-GCM
script-security 3
auth-user-pass-verify /etc/openvpn/checkpsw.sh via-file
verify-client-cert none
keepalive 10 120
persist-key
persist-tun
status /var/log/openvpn-status.log
verb 3
EOF

echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-safelinkhub-openvpn.conf
sysctl -p /etc/sysctl.d/99-safelinkhub-openvpn.conf

iptables -t nat -A POSTROUTING -s 10.67.0.0/24 -o "$IFACE" -j MASQUERADE
command -v netfilter-persistent >/dev/null 2>&1 && netfilter-persistent save || true

systemctl enable openvpn@server
systemctl restart openvpn@server

echo "OpenVPN relay ready on udp/1194 (subnet 10.67.0.0/24)"

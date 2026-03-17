//! Minimal UPnP/IGD NAT traversal support.
//!
//! When the `upnp` config flag is set, the node attempts to create an external
//! port mapping on the local gateway so that inbound P2P connections can reach
//! it through NAT routers that support UPnP Internet Gateway Device (IGD).

use std::net::SocketAddr;
use tokio::net::UdpSocket;
use tracing::{info, warn};

/// Try to map the external P2P port via UPnP IGD.
///
/// This sends a SSDP M-SEARCH multicast to discover a local gateway, then
/// issues a simple SOAP AddPortMapping request.  Both steps have short
/// timeouts so this never blocks startup for long.
pub async fn try_map_port(local_addr: SocketAddr) -> Option<SocketAddr> {
    let port = local_addr.port();
    info!(port, "UPnP: attempting to map external port");

    // ── Step 1: SSDP discovery ──────────────────────────────
    let sock = match UdpSocket::bind("0.0.0.0:0").await {
        Ok(s) => s,
        Err(e) => {
            warn!("UPnP: failed to bind discovery socket: {e}");
            return None;
        }
    };

    let ssdp_request = format!(
        "M-SEARCH * HTTP/1.1\r\n\
         HOST: 239.255.255.250:1900\r\n\
         MAN: \"ssdp:discover\"\r\n\
         MX: 2\r\n\
         ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n\
         \r\n"
    );

    let multicast: SocketAddr = "239.255.255.250:1900".parse().unwrap();
    if let Err(e) = sock.send_to(ssdp_request.as_bytes(), multicast).await {
        warn!("UPnP: SSDP M-SEARCH send failed: {e}");
        return None;
    }

    let mut buf = [0u8; 2048];
    let deadline = tokio::time::sleep(std::time::Duration::from_secs(3));
    tokio::pin!(deadline);

    let gateway_location: Option<String> = tokio::select! {
        result = sock.recv_from(&mut buf) => {
            match result {
                Ok((n, _src)) => {
                    let response = String::from_utf8_lossy(&buf[..n]);
                    // Extract LOCATION header
                    response.lines()
                        .find(|l| l.to_ascii_lowercase().starts_with("location:"))
                        .map(|l| l[9..].trim().to_string())
                }
                Err(e) => {
                    warn!("UPnP: SSDP recv failed: {e}");
                    None
                }
            }
        }
        _ = &mut deadline => {
            info!("UPnP: no gateway responded within 3 s");
            None
        }
    };

    let location = match gateway_location {
        Some(loc) => loc,
        None => return None,
    };

    info!(%location, "UPnP: discovered gateway");

    // ── Step 2: AddPortMapping SOAP request ────────────────
    //
    // A full implementation would parse the gateway's XML descriptor to
    // find the control URL, then issue a SOAP AddPortMapping.  For now we
    // log the discovery and return None to indicate mapping was not
    // completed — the node will still work (outbound connections are fine;
    // inbound depends on router config).

    info!(
        port,
        "UPnP: gateway found but full SOAP mapping not yet implemented — \
         inbound connections may require manual port-forwarding"
    );

    None
}

import React, { useState } from "react";

function genAddress() {
  const chars = "0123456789abcdef";
  let addr = "0x";
  for (let i = 0; i < 40; i++)
    addr += chars[Math.floor(Math.random() * chars.length)];
  return addr;
}

export default function App() {
  const [address, setAddress] = useState("");
  const [chainStatus, setChainStatus] = useState(null);

  async function checkHealth() {
    try {
      const r = await fetch("http://localhost:26657/health");
      const j = await r.json();
      setChainStatus(j);
    } catch (e) {
      setChainStatus({ error: e.message });
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h2>Kuber Wallet UI</h2>

      <button onClick={() => setAddress(genAddress())}>Generate Address</button>
      <p><b>Address:</b> {address}</p>

      <button onClick={checkHealth}>Check Chain Health</button>
      <pre>{JSON.stringify(chainStatus, null, 2)}</pre>
    </div>
  );
}

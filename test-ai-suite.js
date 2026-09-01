async function runSuite() {
  const loginRes = await fetch("http://localhost:4000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "admin@doers-os.internal", password: "Password123!" }),
  });
  const cookieHeader = loginRes.headers.get("set-cookie");
  const tokenMatch = cookieHeader && cookieHeader.match(/doers_session=([^;]+)/);
  const token = tokenMatch ? tokenMatch[1] : "";

  const queries = [
    "who are the managers?",
    "find managers who has created todo",
    "find superadmin who has created todo",
    "which uer has created todo",
    "show todos"
  ];

  for (const q of queries) {
    console.log(`\n========================================`);
    console.log(`TEST QUERY: "${q}"`);
    const chatRes = await fetch("http://localhost:4000/api/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": `doers_session=${token}`
      },
      body: JSON.stringify({ message: q }),
    });
    const data = await chatRes.json();
    console.log("Response Mode:", data.mode);
    console.log("Response Text:", data.text);
    if (data.ui) {
      console.log("Page ID:", data.ui?.page?.id);
      console.log("Page Title:", data.ui?.page?.title);
      console.log("Sections:", data.ui?.page?.sections?.map(s => ({ id: s.id, label: s.label, type: s.type, rowCount: s.state?.rows?.length })));
    }
  }
}

runSuite().catch(console.error);

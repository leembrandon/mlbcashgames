export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const slateUrl = searchParams.get("slate");

  if (!slateUrl || !/^[A-Za-z0-9]+$/.test(slateUrl)) {
    return Response.json(
      { error: "Missing or invalid slate parameter" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(
      `https://www.dailyfantasyfuel.com/data/playerdetails/mlb/dk/${slateUrl}?x=1`,
      { next: { revalidate: 300 } }
    );

    if (!res.ok) {
      return Response.json(
        { error: `Upstream returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

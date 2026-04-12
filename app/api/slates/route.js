export async function GET() {
  try {
    const res = await fetch(
      "https://www.dailyfantasyfuel.com/data/slates/next/mlb/dk?x=1",
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

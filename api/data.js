import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { type } = req.query;

    if (type === "predictions") {
      // Get date from query or default to today
      const date =
        req.query.date || new Date().toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("predictions")
        .select("*")
        .eq("game_date", date)
        .order("nrfi_prob", { ascending: false });

      if (error) throw error;
      return res.status(200).json({ predictions: data });
    }

    if (type === "summary") {
      const date =
        req.query.date || new Date().toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("daily_summary")
        .select("*")
        .eq("game_date", date)
        .maybeSingle();

      if (error) throw error;
      return res.status(200).json({ summary: data });
    }

    if (type === "history") {
      // Last N days of summaries for the track record page
      const days = Math.min(parseInt(req.query.days) || 30, 90);
      const { data, error } = await supabase
        .from("daily_summary")
        .select("*")
        .order("game_date", { ascending: false })
        .limit(days);

      if (error) throw error;
      return res.status(200).json({ history: data });
    }

    return res.status(400).json({ error: "Invalid type. Use: predictions, summary, history" });
  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

//! Riot Live Client Data API (https://127.0.0.1:2999), read-only and official.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub name: String,
    pub count: u32,
}

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct GameState {
    pub in_game: bool,
    pub champion: String,
    pub level: u32,
    pub gold: u32,
    pub game_time: u32,
    /// Raw mode from the client, e.g. "CLASSIC", "ARAM", "PRACTICETOOL".
    pub game_mode: String,
    pub items: Vec<Item>,
}

#[derive(Deserialize)]
struct AllGameData {
    #[serde(rename = "activePlayer")]
    active_player: Option<Value>,
    #[serde(rename = "allPlayers", default)]
    all_players: Vec<Value>,
    #[serde(rename = "gameData")]
    game_data: Option<Value>,
}

fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(Value::as_str).unwrap_or("")
}

/// Turn the raw `allgamedata` JSON into the slim state the overlay needs.
pub fn parse(body: &str) -> Option<GameState> {
    let data: AllGameData = serde_json::from_str(body).ok()?;
    let active = data.active_player?;

    let id = s(&active, "riotId");
    let name = s(&active, "summonerName");
    let me = data.all_players.iter().find(|p| {
        (!id.is_empty() && s(p, "riotId") == id)
            || (!name.is_empty() && s(p, "summonerName") == name)
    })?;

    let items = me
        .get("items")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .map(|i| Item {
                    name: s(i, "displayName").to_string(),
                    count: i.get("count").and_then(Value::as_u64).unwrap_or(1) as u32,
                })
                .collect()
        })
        .unwrap_or_default();

    Some(GameState {
        in_game: true,
        champion: s(me, "championName").to_string(),
        level: active.get("level").and_then(Value::as_u64).unwrap_or(1) as u32,
        gold: active
            .get("currentGold")
            .and_then(Value::as_f64)
            .unwrap_or(0.0) as u32,
        game_time: data
            .game_data
            .as_ref()
            .and_then(|g| g.get("gameTime"))
            .and_then(Value::as_f64)
            .unwrap_or(0.0) as u32,
        game_mode: data
            .game_data
            .as_ref()
            .map(|g| s(g, "gameMode").to_string())
            .unwrap_or_default(),
        items,
    })
}

/// Fetch the current game state. `None` means no game is running.
pub fn fetch(agent: &ureq::Agent) -> Option<GameState> {
    let body = agent
        .get("https://127.0.0.1:2999/liveclientdata/allgamedata")
        .call()
        .ok()?
        .into_string()
        .ok()?;
    parse(&body)
}

/// The local API uses a Riot-issued self-signed certificate on localhost only.
pub fn agent() -> ureq::Agent {
    let tls = native_tls::TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .expect("tls");
    ureq::AgentBuilder::new()
        .tls_connector(std::sync::Arc::new(tls))
        .timeout(std::time::Duration::from_secs(2))
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
      "activePlayer": {"riotId":"Sam#EUW","summonerName":"Sam","level":7,"currentGold":1234.6},
      "allPlayers": [
        {"riotId":"Foe#1","summonerName":"Foe","championName":"Garen","items":[]},
        {"riotId":"Sam#EUW","summonerName":"Sam","championName":"Gwen",
         "items":[{"displayName":"Doran's Blade","count":1},{"displayName":"Control Ward","count":2}]}
      ],
      "gameData": {"gameTime": 301.9, "gameMode": "PRACTICETOOL"}
    }"#;

    #[test]
    fn parses_active_player() {
        let g = parse(SAMPLE).unwrap();
        assert_eq!(g.champion, "Gwen");
        assert_eq!((g.level, g.gold, g.game_time), (7, 1234, 301));
        assert_eq!(g.game_mode, "PRACTICETOOL");
        assert_eq!(g.items.len(), 2);
        assert_eq!(
            g.items[1],
            Item {
                name: "Control Ward".into(),
                count: 2
            }
        );
    }

    #[test]
    fn no_game_data_is_none() {
        assert!(parse("{}").is_none());
        assert!(parse("not json").is_none());
    }
}

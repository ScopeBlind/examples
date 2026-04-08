permit(
  principal,
  action == Action::"execute_api_call",
  resource
) when {
  context.agent_tier in ["research", "trading", "admin"] &&
  context.daily_api_calls < 1000 &&
  context.spend_usd <= 500.00
};

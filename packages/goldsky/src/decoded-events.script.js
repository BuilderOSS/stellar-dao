function invoke(data) {
  function parsePayload(value) {
    if (typeof value === 'string') {
      var trimmed = value.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          return parsePayload(JSON.parse(trimmed));
        } catch {
          return null;
        }
      }
    }

    if (value && typeof value === 'object') {
      return value;
    }

    return null;
  }

  function pick(payload, keys) {
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (payload && payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
        return payload[key];
      }
    }

    return undefined;
  }

  function stringify(value) {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value === 'string') {
      var trimmed = value.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        return value;
      }
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  var payload = parsePayload(data.data) || parsePayload(data.payload) || parsePayload(data);
  var eventName = data.event_name || data.event_type || pick(payload, ['event_name', 'event_type']);
  if (!eventName) {
    return null;
  }

  var proposalId = pick(payload, ['proposal_id', 'proposalId']);
  var actor = pick(payload, ['actor', 'proposer', 'voter', 'bidder', 'minter', 'owner', 'changed_by', 'cancelled_by', 'executor', 'governor', 'treasury', 'new_treasury', 'new_governor']);
  var tokenId = pick(payload, ['token_id', 'tokenId']);
  var amount = pick(payload, ['amount', 'weight']);
  var target = pick(payload, ['target']);
  var functionName = pick(payload, ['function']);

  return {
    event_id: data.event_id || data.id || null,
    deployment_id: data.deployment_id || null,
    contract_id: data.contract_id || null,
    contract_role: data.contract_role || 'unknown',
    event_name: String(eventName),
    event_type: data.event_type || null,
    payload: stringify(payload || data.data || data),
    proposal_id: proposalId || null,
    proposal_number: pick(payload, ['proposal_number']) || null,
    actor: actor || null,
    amount: amount ?? null,
    token_id: tokenId ?? null,
    bidder: pick(payload, ['bidder']) || null,
    minter: pick(payload, ['minter']) || null,
    owner: pick(payload, ['owner']) || null,
    from_address: pick(payload, ['from', 'from_delegate']) || null,
    to_address: pick(payload, ['to', 'to_delegate']) || null,
    changed_by: pick(payload, ['changed_by']) || null,
    cancelled_by: pick(payload, ['cancelled_by']) || null,
    executor: pick(payload, ['executor']) || null,
    governor: pick(payload, ['governor']) || null,
    treasury: pick(payload, ['treasury']) || null,
    new_treasury: pick(payload, ['new_treasury']) || null,
    new_governor: pick(payload, ['new_governor']) || null,
    token_contract: pick(payload, ['token_contract']) || null,
    token_contract_id: pick(payload, ['token_contract_id']) || null,
    target: target || null,
    function: functionName || null,
    support: pick(payload, ['support']) || null,
    reason: pick(payload, ['reason']) || null,
    state: pick(payload, ['state']) || null,
    eta: pick(payload, ['eta']) || null,
    description: pick(payload, ['description']) || null,
    snapshot_ledger: pick(payload, ['snapshot', 'vote_snapshot']) || null,
    vote_start_timestamp: pick(payload, ['vote_start']) || null,
    deadline_ledger: pick(payload, ['deadline', 'vote_end']) || null,
    action_count: pick(payload, ['action_count']) || null,
    transaction_hash: data.transaction_hash || null,
    transaction_successful: data.transaction_successful ?? null,
    ledger_sequence: data.ledger_sequence ?? null,
    ledger_hash: data.ledger_hash || null,
    ledger_closed_at: data.ledger_closed_at || null,
    transaction_index: data.transaction_index ?? null,
    operation_index: data.operation_index ?? null,
    event_index: data.event_index ?? null,
    operation_type: data.operation_type || null,
    _gs_op: data._gs_op || null
  };
}

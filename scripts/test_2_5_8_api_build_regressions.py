from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
server = (root / 'services/api/internal/httpapi/server.go').read_text(encoding='utf-8')

customer_portal = (root / 'services/api/internal/httpapi/customer_portal.go').read_text(encoding='utf-8')


def func_block(name: str, next_name: str) -> str:
    start = server.find(f'func (s *Server) {name}(')
    end = server.find(f'func (s *Server) {next_name}(', start)
    if start < 0 or end < 0:
        raise SystemExit(f'FAIL: function boundary not found for {name}')
    return server[start:end]

details_block = func_block('conversationDetails', 'saveConversationCustomer')
save_block = func_block('saveConversationCustomer', 'updateConversationStatus')
profile_block = func_block('whatsappProfile', 'supportWhatsAppEvent')

contextual_start = server.find('func contextualCheckoutData(')
contextual_end = server.find('func allowedPaymentProof(', contextual_start)
if contextual_start < 0 or contextual_end < 0:
    raise SystemExit('FAIL: contextualCheckoutData boundary not found')
contextual_block = server[contextual_start:contextual_end]

checks = {
    'conversationDetails keeps store id used in response': re.search(
        r'\n\s*sid,\s*jid,\s*ok\s*:=\s*s\.conversationOwned\(', details_block
    ) is not None,
    'saveConversationCustomer does not bind unused store id': re.search(
        r'\n\s*_,\s*jid,\s*ok\s*:=\s*s\.conversationOwned\(', save_block
    ) is not None,
    'pgx CommandTag RowsAffected uses single return value': re.search(
        r'\n\s*rows\s*:=\s*result\.RowsAffected\(\)', profile_block
    ) is not None,
    'pgx CommandTag RowsAffected is not treated as (value,error)': 'rows, _ := result.RowsAffected()' not in profile_block,
    'contextual checkout switch has no duplicate default clause': '\n\t\tdefault:\n\t\tdefault:' not in contextual_block,
    'customer portal imports encoding/json when using json.Unmarshal': ('json.Unmarshal' not in customer_portal or '"encoding/json"' in customer_portal),
}

failed = [name for name, ok in checks.items() if not ok]
if failed:
    raise SystemExit('FAIL: ' + ', '.join(failed))
print('PASS: API build regression guards')

from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
server=(root/'services/api/internal/httpapi/server.go').read_text(encoding='utf-8')
customers=(root/'apps/web/app/customers/page.tsx').read_text(encoding='utf-8')
types=(root/'apps/web/lib/types.ts').read_text(encoding='utf-8')

# The 4.1.2 production failure was caused by conversationID leaking into
# listConversations while the variable only exists in listCustomers.
conv=re.search(r'func \(s \*Server\) listConversations\(.*?\n}\nfunc \(s \*Server\) conversationOwned',server,re.S)
assert conv, 'listConversations block not found'
assert 'conversationID' not in conv.group(0), 'conversationID leaked into listConversations; this does not compile'

cust=re.search(r'func \(s \*Server\) listCustomers\(.*?\n}\n\nfunc \(s \*Server\) listContacts',server,re.S)
assert cust, 'listCustomers block not found'
block=cust.group(0)
for token in [
    'c.id::text AS conversation_id',
    'conversationID string',
    '&conversationID',
    '"conversation_id": conversationID',
]:
    assert token in block, f'listCustomers missing {token}'

assert 'conversation_id?:string' in types, 'Customer type must expose optional conversation_id'
assert "openSoftphone(c.phone,c.name,c.conversation_id,'customer'" in customers, 'customer row must call as customer'
assert "openSoftphone(c.phone,c.name,c.conversation_id,'contact'" in customers, 'contact row must call as contact'
assert "openSoftphone(detail.phone,detail.name,detail.conversation_id,'customer'" in customers, 'customer detail must preserve conversation id'

print('PASS: WAMERCIO 4.1.3 Go scope and customer-call regression')

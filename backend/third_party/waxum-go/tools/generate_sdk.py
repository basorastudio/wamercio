import json, os, re, textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = ROOT/'openapi'/'waxum.openapi.json'
spec = json.loads(SPEC_PATH.read_text())

INITIALISMS = {
    'id':'ID','ids':'IDs','url':'URL','urls':'URLs','jid':'JID','jids':'JIDs','qr':'QR','tts':'TTS','nats':'NATS',
    'hmac':'HMAC','sha256':'SHA256','api':'API','http':'HTTP','https':'HTTPS','jwt':'JWT','mime':'MIME','mimetype':'MIMEType',
    'os':'OS','lid':'LID','mex':'MEX','pcm':'PCM','wav':'WAV','rtp':'RTP','uuid':'UUID','dlq':'DLQ','ws':'WS',
    'ip':'IP','ttl':'TTL','sms':'SMS','otp':'OTP','html':'HTML','json':'JSON','xml':'XML','csv':'CSV','pdf':'PDF',
}
GO_KEYWORDS = {'break','default','func','interface','select','case','defer','go','map','struct','chan','else','goto','package','switch','const','fallthrough','if','range','type','continue','for','import','return','var'}

def words(name):
    name = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', name)
    return [x for x in re.split(r'[^A-Za-z0-9]+', name) if x]

def pascal(name):
    out=[]
    for w in words(name):
        lw=w.lower()
        out.append(INITIALISMS.get(lw, w[:1].upper()+w[1:].lower()))
    s=''.join(out) or 'Value'
    if s[0].isdigit(): s='N'+s
    return s

def field_name(name):
    s=pascal(name)
    if s.lower() in GO_KEYWORDS: s += 'Value'
    return s

def camel(name):
    p=pascal(name)
    return p[:1].lower()+p[1:]

def clean_comment(s):
    if not s: return ''
    s=' '.join(str(s).split())
    return s.replace('`','\'')

def ref_name(ref):
    return ref.rsplit('/',1)[-1]

def nullable_info(schema):
    nullable=False
    if not isinstance(schema,dict): return schema,nullable
    t=schema.get('type')
    if isinstance(t,list):
        nullable='null' in t
        nts=[x for x in t if x!='null']
        schema=dict(schema)
        if len(nts)==1: schema['type']=nts[0]
        elif nts: schema['type']=nts
        else: schema.pop('type',None)
    one=schema.get('oneOf')
    if one:
        nonnull=[]
        for x in one:
            if x.get('type')=='null': nullable=True
            else: nonnull.append(x)
        if len(nonnull)==1:
            merged=dict(nonnull[0])
            for k,v in schema.items():
                if k!='oneOf' and k not in merged: merged[k]=v
            schema=merged
    return schema,nullable

def base_go_type(schema):
    if not schema: return 'json.RawMessage', False
    schema, nullable = nullable_info(schema)
    if '$ref' in schema:
        return ref_name(schema['$ref']), nullable
    if 'oneOf' in schema or 'anyOf' in schema:
        return 'json.RawMessage', nullable
    typ=schema.get('type')
    if typ=='string': return 'string', nullable
    if typ=='integer': return ('int32' if schema.get('format')=='int32' else 'int64'), nullable
    if typ=='number': return 'float64', nullable
    if typ=='boolean': return 'bool', nullable
    if typ=='array':
        it,_=base_go_type(schema.get('items',{}))
        return '[]'+it, nullable
    if typ=='object' or 'properties' in schema:
        ap=schema.get('additionalProperties')
        if ap:
            vt,_=base_go_type(ap if isinstance(ap,dict) else {})
            return 'map[string]'+vt, nullable
        return 'map[string]any', nullable
    return 'json.RawMessage', nullable

def field_go_type(schema, required):
    base, nullable=base_go_type(schema)
    pointerable = not (base.startswith('[]') or base.startswith('map[') or base in {'json.RawMessage','any'})
    if (nullable or not required) and pointerable:
        return '*'+base
    return base

schemas=spec.get('components',{}).get('schemas',{})

# Models
lines=['// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.','', 'package waxum','', 'import "encoding/json"','']
for name,schema in schemas.items():
    desc=clean_comment(schema.get('description'))
    if desc:
        lines.append('// '+name+' '+desc)
    else:
        lines.append('// '+name+' represents the Waxum API schema of the same name.')
    if schema.get('enum') is not None:
        lines.append(f'type {name} string')
        lines.append('')
        lines.append('const (')
        for val in schema['enum']:
            cname=name+pascal(str(val))
            lines.append(f'\t{cname} {name} = {json.dumps(val)}')
        lines.append(')')
        lines.append('')
        continue
    if name=='MediaData':
        lines += [
            'type MediaData struct {',
            '\tURL *string `json:"url,omitempty"`',
            '\tData *string `json:"data,omitempty"`',
            '\tMIMEType *string `json:"mimetype,omitempty"`',
            '\tDirectPath *string `json:"direct_path,omitempty"`',
            '\tMediaKey *string `json:"media_key,omitempty"`',
            '\tFileSHA256 *string `json:"file_sha256,omitempty"`',
            '\tFileEncSHA256 *string `json:"file_enc_sha256,omitempty"`',
            '\tFileLength *int64 `json:"file_length,omitempty"`',
            '}', '',
        ]
        continue
    props=schema.get('properties')
    if props is not None:
        req=set(schema.get('required',[]))
        lines.append(f'type {name} struct {{')
        for jn,ps in props.items():
            fn=field_name(jn)
            gt=field_go_type(ps, jn in req)
            tag=f'json:"{jn}' + ('' if jn in req else ',omitempty') + '"'
            c=clean_comment(ps.get('description'))
            if c: lines.append(f'\t// {fn} {c}')
            lines.append(f'\t{fn} {gt} `{tag}`')
        lines.append('}')
        lines.append('')
        continue
    if 'oneOf' in schema:
        lines.append(f'type {name} json.RawMessage')
        lines.append('')
        continue
    bt,_=base_go_type(schema)
    lines.append(f'type {name} {bt}')
    lines.append('')
(ROOT/'models_generated.go').write_text('\n'.join(lines)+'\n')

HTTP_METHODS={'get','post','put','delete','patch','head','options'}
ops_by_tag={}
all_ops=[]
for path,item in spec.get('paths',{}).items():
    common_params=item.get('parameters',[])
    for method,op in item.items():
        if method.lower() not in HTTP_METHODS: continue
        tag=(op.get('tags') or ['default'])[0]
        rec={'path':path,'method':method.upper(),'op':op,'params':common_params+op.get('parameters',[]),'tag':tag}
        ops_by_tag.setdefault(tag,[]).append(rec)
        all_ops.append(rec)

TAG_TYPE={
 'sessions':'SessionsService','messages':'MessagesService','groups':'GroupsService','contacts':'ContactsService',
 'media':'MediaService','calls':'CallsService','webhooks':'WebhooksService','presence':'PresenceService',
 'chatstate':'ChatStateService','privacy':'PrivacyService','blocking':'BlockingService','mex':'MEXService',
 'newsletter':'NewsletterService','operations':'OperationsService','nats':'NATSService','status':'StatusService',
}
TAG_FIELD={
 'sessions':'Sessions','messages':'Messages','groups':'Groups','contacts':'Contacts','media':'Media','calls':'Calls',
 'webhooks':'Webhooks','presence':'Presence','chatstate':'ChatState','privacy':'Privacy','blocking':'Blocking','mex':'MEX',
 'newsletter':'Newsletter','operations':'Operations','nats':'NATS','status':'Status',
}

METHOD_OVERRIDES={
 'list_sessions':'List','create_session':'Create','get_session':'Get','delete_session':'Delete','connect_session':'Connect',
 'disconnect_session':'Disconnect','pair_session':'Pair','get_qr_code':'GetQRCode','get_device_info':'GetDeviceInfo','get_session_status':'GetStatus',
 'block_contact':'Block','is_blocked':'IsBlocked','get_blocklist':'List','unblock_contact':'Unblock',
 'accept_call':'Accept','play_call':'Play','reject_call':'Reject','ring_call':'Ring','terminate_call':'Terminate','tts_call':'TTS',
 'send_chatstate':'Send','send_typing':'Typing','list_contacts':'List','check_on_whatsapp':'CheckOnWhatsApp',
 'get_contact_info':'GetContactInfo','get_user_info':'GetUserInfo','get_profile_picture':'GetProfilePicture',
 'list_groups':'List','create_group':'Create','get_group':'Get','get_group_info':'GetInfo','leave_group':'Leave',
 'set_group_description':'SetDescription','get_invite_link':'GetInviteLink','set_group_settings':'SetSettings','set_group_subject':'SetSubject',
 'add_participants':'AddParticipants','remove_participants':'RemoveParticipants','promote_participants':'PromoteParticipants','demote_participants':'DemoteParticipants',
 'download_media':'Download','upload_media':'Upload','mex_mutate':'Mutate','mex_query':'Query','set_presence':'Set','subscribe_presence':'Subscribe',
 'get_privacy_settings':'GetSettings','send_status_reaction':'React','list_webhooks':'List','register_webhook':'Register',
 'unregister_webhook':'Unregister','reenable_webhook':'Reenable','nats_status':'Status','nats_list_consumers':'ListConsumers','nats_purge_stream':'PurgeStream',
 'get_history_sync':'GetHistorySync','set_history_sync':'SetHistorySync','get_auto_reconnect':'GetAutoReconnect','set_auto_reconnect':'SetAutoReconnect',
 'spam_report':'ReportSpam','tctoken_prune':'PruneExpiredTCTokens','tctoken_issue':'IssueTCTokens','tctoken_list':'ListTCTokens','tctoken_get':'GetTCToken',
}

def method_name(opid): return METHOD_OVERRIDES.get(opid,pascal(opid))

def response_type(op):
    responses=op.get('responses',{})
    candidates=[]
    for code,r in responses.items():
        if str(code).startswith('2'):
            candidates.append((str(code),r))
    if not candidates: return None
    candidates.sort(key=lambda x:x[0])
    for _,r in candidates:
        cont=r.get('content',{})
        for ctype in ('application/json','application/octet-stream','audio/wav'):
            if ctype in cont:
                sch=cont[ctype].get('schema',{})
                if ctype!='application/json': return '[]byte'
                bt,_=base_go_type(sch)
                return bt
    return None

def request_body_type(op):
    rb=op.get('requestBody')
    if not rb: return None
    cont=rb.get('content',{})
    sch=(cont.get('application/json') or {}).get('schema')
    if not sch: return None
    bt,_=base_go_type(sch)
    return bt

def unique_params(params):
    seen=set(); out=[]
    for p in params:
        key=(p.get('name'),p.get('in'))
        if key not in seen:
            seen.add(key); out.append(p)
    return out

# Generate service files
for tag,recs in ops_by_tag.items():
    st=TAG_TYPE.get(tag,pascal(tag)+'Service')
    imports={'context','net/http'}
    # json used for raw response only
    has_raw=False
    has_query=False
    file_lines=[f'// Code generated from openapi/waxum.openapi.json; DO NOT EDIT.','', 'package waxum','']
    body=[]
    body.append(f'// {st} provides access to Waxum {tag} endpoints.')
    body.append(f'type {st} struct {{ client *Client }}')
    body.append('')
    for rec in recs:
        op=rec['op']; opid=op.get('operationId') or rec['method'].lower()+'_'+rec['path']
        if opid=='upload_media':
            continue
        mn=method_name(opid)
        params=unique_params(rec['params'])
        path_params=[p for p in params if p.get('in')=='path']
        query_params=[p for p in params if p.get('in')=='query']
        rb=request_body_type(op)
        rt=response_type(op)
        if rt is None:
            rt='json.RawMessage'; has_raw=True
        if query_params:
            has_query=True
            pn=mn+'Params'
            body.append(f'// {pn} contains optional query parameters for {mn}.')
            body.append(f'type {pn} struct {{')
            for p in query_params:
                gt=field_go_type(p.get('schema',{}), p.get('required',False))
                body.append(f'\t{field_name(p["name"])} {gt}')
            body.append('}')
            body.append('')
        summary=clean_comment(op.get('summary') or op.get('description')) or 'calls the corresponding Waxum endpoint.'
        body.append(f'// {mn} {summary} OpenAPI operationId: {opid}.')
        args=['ctx context.Context']
        for p in path_params:
            gt,_=base_go_type(p.get('schema',{}))
            args.append(f'{camel(p["name"])} {gt}')
        if query_params: args.append(f'params *{mn}Params')
        if rb: args.append(f'body *{rb}')
        body.append(f'func (s *{st}) {mn}({", ".join(args)}) (*{rt}, *Response, error) {{')
        body.append(f'\tpath := {json.dumps(rec["path"])}')
        for p in path_params:
            v=camel(p['name'])
            body.append(f'\tpath = replacePathParam(path, {json.dumps(p["name"])}, formatPathValue({v}))')
        body_arg='body' if rb else 'nil'
        body.append(f'\treq, err := s.client.newRequest(ctx, http.Method{pascal(rec["method"].lower())}, path, {body_arg})')
        body.append('\tif err != nil { return nil, nil, err }')
        if query_params:
            body.append('\tif params != nil {')
            body.append('\t\tq := req.URL.Query()')
            for p in query_params:
                fn=field_name(p['name']); jn=p['name']; gt=field_go_type(p.get('schema',{}),p.get('required',False))
                if gt.startswith('*'):
                    body.append(f'\t\tif params.{fn} != nil {{ q.Set({json.dumps(jn)}, formatQueryValue(*params.{fn})) }}')
                else:
                    body.append(f'\t\tq.Set({json.dumps(jn)}, formatQueryValue(params.{fn}))')
            body.append('\t\treq.URL.RawQuery = q.Encode()')
            body.append('\t}')
        body.append(f'\tvar result {rt}')
        body.append('\tresp, err := s.client.do(req, &result)')
        body.append('\tif err != nil { return nil, resp, err }')
        body.append('\treturn &result, resp, nil')
        body.append('}')
        body.append('')
    if has_raw: imports.add('encoding/json')
    imp='import (\n'+''.join(f'\t"{i}"\n' for i in sorted(imports)) + ')\n'
    file_lines.append(imp)
    file_lines.extend(body)
    (ROOT/f'{tag}_generated.go').write_text('\n'.join(file_lines)+'\n')

# service metadata for client generation
services=[(TAG_FIELD[t],TAG_TYPE[t]) for t in TAG_TYPE if t in ops_by_tag]
meta={'services':services,'operation_count':len(all_ops),'schema_count':len(schemas),'api_version':spec.get('info',{}).get('version','')}
(ROOT/'tools'/'generation-meta.json').write_text(json.dumps(meta,indent=2)+'\n')

# endpoint reference docs
md=['# Referencia de métodos del SDK','','Generado desde `openapi/waxum.openapi.json`.','',f'Operaciones: **{len(all_ops)}**.','']
for tag in sorted(ops_by_tag):
    md.append(f'## {TAG_FIELD.get(tag,pascal(tag))}')
    md.append('')
    md.append('| Método Go | HTTP | Endpoint | Operation ID |')
    md.append('|---|---:|---|---|')
    for rec in ops_by_tag[tag]:
        opid=rec['op'].get('operationId','')
        md.append(f'| `{method_name(opid)}` | `{rec["method"]}` | `{rec["path"]}` | `{opid}` |')
    md.append('')
(ROOT/'docs'/'ENDPOINTS.md').write_text('\n'.join(md)+'\n')

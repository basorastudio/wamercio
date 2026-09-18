from pathlib import Path

root=Path(__file__).resolve().parents[1]
soft=(root/'apps/web/components/calls-softphone.tsx').read_text()
assert "if(bc?.id===x.id)await bc.stopVideo" not in soft
assert soft.count("if(bc && bc.id===x.id)await bc.stopVideo") >= 2
assert "let bc=browserCall.current?.id===x.id?browserCall.current:null" in soft
assert "if(!bc)bc=await connectAudio(x.id)" in soft
assert "if(!bc)throw new Error('Conecta primero el audio del softphone.')" in soft
print('PASS: WAMERCIO 4.1.14 TypeScript video nullable-call regression')

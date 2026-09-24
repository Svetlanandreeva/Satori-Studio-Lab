import { NextRequest, NextResponse } from "next/server";
import { clearOpenAiKey, getOpenAiKey, openAiSettings, saveOpenAiSettings } from "@/lib/ai-settings";
export const dynamic="force-dynamic";

export async function GET(){return NextResponse.json(openAiSettings())}

async function openAiError(r: Response) {
  let message = `OpenAI вернул ошибку ${r.status}`;
  let code = "";
  try {
    const data = await r.json() as { error?: { message?: string; code?: string; type?: string } };
    message = data.error?.message || message;
    code = data.error?.code || data.error?.type || "";
  } catch {}
  if (r.status === 401) message = "Ключ недействителен, отозван или введён не полностью. Создай новый API key и замени его в CRM.";
  else if (r.status === 429 && (code.includes("quota") || code.includes("balance") || code.includes("limit"))) message = "Ключ рабочий, но у API нет доступного баланса или достигнут лимит расходов.";
  else if (r.status === 403) message = "Ключ распознан, но у него недостаточно прав для этого API-проекта.";
  return { message, code, status: r.status };
}

export async function POST(req:NextRequest){
 try{
  const body=await req.json() as {apiKey?:string;model?:string;action?:string};
  if(body.action==="disconnect"){clearOpenAiKey();return NextResponse.json(openAiSettings())}
  if(body.action==="test"){
   const key=getOpenAiKey();
   if(!key)return NextResponse.json({error:"Сначала сохраните API key"},{status:400});
   // /v1/me is the documented endpoint for validating which user/org a key belongs to.
   const auth=await fetch("https://api.openai.com/v1/me",{headers:{Authorization:`Bearer ${key}`},cache:"no-store"});
   if(!auth.ok){const e=await openAiError(auth);return NextResponse.json({error:e.message,openAiStatus:e.status,openAiCode:e.code},{status:400})}
   // A valid key may still be unable to run inference because of billing/limits.
   const model=openAiSettings().model;
   const inference=await fetch("https://api.openai.com/v1/responses",{
     method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
     body:JSON.stringify({model,input:"Ответь одним словом: OK",max_output_tokens:8}),cache:"no-store"
   });
   if(!inference.ok){const e=await openAiError(inference);return NextResponse.json({error:e.message,openAiStatus:e.status,openAiCode:e.code,keyValid:true},{status:400})}
   return NextResponse.json({ok:true,keyValid:true,...openAiSettings()});
  }
  if(body.apiKey && !body.apiKey.trim().startsWith("sk-"))return NextResponse.json({error:"Похоже, это не OpenAI API key"},{status:400});
  return NextResponse.json(saveOpenAiSettings(body.apiKey||"",body.model));
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Ошибка настройки OpenAI"},{status:400})}
}

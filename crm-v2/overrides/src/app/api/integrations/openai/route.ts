import { NextRequest, NextResponse } from "next/server";
import { clearOpenAiKey, getOpenAiKey, openAiSettings, saveOpenAiSettings } from "@/lib/ai-settings";
export const dynamic="force-dynamic";
export async function GET(){return NextResponse.json(openAiSettings())}
export async function POST(req:NextRequest){
 try{
  const body=await req.json() as {apiKey?:string;model?:string;action?:string};
  if(body.action==="disconnect"){clearOpenAiKey();return NextResponse.json(openAiSettings())}
  if(body.action==="test"){
   const key=getOpenAiKey(); if(!key)return NextResponse.json({error:"Сначала сохраните API key"},{status:400});
   const r=await fetch("https://api.openai.com/v1/models",{headers:{Authorization:`Bearer ${key}`}});
   if(!r.ok)return NextResponse.json({error:"OpenAI не принял ключ"},{status:400});
   return NextResponse.json({ok:true,...openAiSettings()});
  }
  if(body.apiKey && !body.apiKey.startsWith("sk-"))return NextResponse.json({error:"Похоже, это не OpenAI API key"},{status:400});
  return NextResponse.json(saveOpenAiSettings(body.apiKey||"",body.model));
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Ошибка настройки OpenAI"},{status:400})}
}

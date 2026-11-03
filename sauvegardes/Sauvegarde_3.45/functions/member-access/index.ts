import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().replace(/\s+/g," ").toLocaleLowerCase("fr");
const validRoles=["master","encadrant","plongeur"];
const permissionKeys=["dashboard","materiel","formation","planning","plongee","masterMateriel","analyse","analyseMateriel","membres","sauvegarde"];
const defaultPermissions=(role:string)=>role==="master"?permissionKeys:role==="encadrant"?["dashboard","materiel","formation","planning","plongee"]:["dashboard","planning"];
const cleanPermissions=(value:unknown,role:string)=>role==="master"?permissionKeys:Array.isArray(value)?[...new Set(value.filter((item):item is string=>typeof item==="string"&&permissionKeys.includes(item)))]:defaultPermissions(role);
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return json({error:"Méthode non autorisée."},405);
 const url=Deno.env.get("SUPABASE_URL"),anonKey=Deno.env.get("SUPABASE_ANON_KEY"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!anonKey||!serviceKey)return json({error:"Configuration serveur Supabase incomplète."},500);
 const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 let body:Record<string,unknown>;try{body=await req.json()}catch{return json({error:"Requête invalide."},400)}
 const action=String(body.action||"");
 if(!["login","create","update","set_active","list_logs"].includes(action))return json({error:"Action inconnue."},400);
 const firstName=String(body.firstName||"").trim().replace(/\s+/g," "),lastName=String(body.lastName||"").trim().replace(/\s+/g," "),password=String(body.password||""),fullName=`${firstName} ${lastName}`.trim(); let diverId=String(body.diver_id||"").trim();
 const attemptedName=fullName.slice(0,161);
 const auditLogin=async(success:boolean,reason:string,userId:string|null=null)=>{
  const ip=req.headers.get("cf-connecting-ip")||req.headers.get("x-real-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||null;
  const userAgent=(req.headers.get("user-agent")||"").slice(0,500)||null;
  const {error}=await admin.from("acro_login_audit").insert({attempted_name:attemptedName,success,reason:reason.slice(0,240),user_id:userId,ip_address:ip,user_agent:userAgent});
  if(error)console.error("login audit insert failed",error.message);
 };
 if(action!=="set_active"&&action!=="list_logs"&&(!firstName||!lastName||firstName.length>80||lastName.length>80)){if(action==="login")await auditLogin(false,"Identifiant incomplet ou invalide.");return json({error:"Renseigne un nom et un prénom valides."},400);}
 if((action==="create"||action==="login"||(action==="update"&&password.length>0))&&(password.length<8||password.length>128)){if(action==="login")await auditLogin(false,"Format du mot de passe invalide.");return json({error:"Le mot de passe doit contenir entre 8 et 128 caractères."},400);}
 if((action==="create"||action==="update")&&(!diverId||diverId.length>160))return json({error:"Sélectionne une fiche plongeur valide pour ce compte."},400);
 if(action==="set_active"&&typeof body.active!=="boolean")return json({error:"L'état actif du compte est manquant."},400);
 let masterUserId:string|null=null;
 if(action!=="login"){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token)return json({error:"Connexion Master requise."},401);
  const caller=createClient(url,anonKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:callerData,error:callerError}=await caller.auth.getUser(token);
  if(callerError||!callerData.user)return json({error:"Session invalide. Reconnecte-toi avec le compte Master."},401);
  masterUserId=callerData.user.id;
  const {data:masterProfile,error:masterError}=await admin.from("acro_profiles").select("user_id,role,is_active").eq("user_id",masterUserId).maybeSingle();
  if(masterError||!masterProfile||masterProfile.role!=="master"||masterProfile.is_active!==true)return json({error:"Seul un Master actif peut gérer les comptes."},403);
 }
 if(action==="list_logs"){
  const {data:logs,error:logsError}=await admin.from("acro_login_audit").select("id,attempted_name,success,reason,user_id,ip_address,user_agent,created_at").order("created_at",{ascending:false}).limit(250);
  if(logsError)return json({error:"Lecture de l’historique impossible : "+logsError.message},500);
  return json({ok:true,logs:logs||[]});
 }
 // Compatibilité V124 : les fiches sont encore enregistrées dans acro_app_state.state->divers.
 // On les synchronise ici vers acro_divers avant de créer/modifier le compte.
 // Cela évite de refuser une fiche visible dans l'application mais pas encore migrée.
 if(action==="create"||action==="update"){
  const {data:legacyState,error:legacyReadError}=await admin.from("acro_app_state").select("state").eq("club_id","acro-plongee").maybeSingle();
  if(legacyReadError)return json({error:"Lecture du répertoire historique impossible : "+legacyReadError.message},500);
  const legacyDivers=Array.isArray(legacyState?.state?.divers)?legacyState.state.divers:[];
  const legacy=legacyDivers.find((d:Record<string,unknown>)=>String(d?.id||"")===diverId);
  if(legacy){
   const known=["id","firstName","lastName","currentLevel","aptitudeLevel","inProgress","encadrement","balance","bitacrosEarned","bitacrosgagnes","soldedebitacros"];
   const numeric=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
   const row={
    id:diverId,
    first_name:String(legacy.firstName||"").trim(),
    last_name:String(legacy.lastName||"").trim(),
    current_level:String(legacy.currentLevel||""),
    aptitude_level:String(legacy.aptitudeLevel||""),
    in_progress:String(legacy.inProgress||""),
    encadrement:String(legacy.encadrement||""),
    balance:numeric(legacy.balance),
    bitacros_earned:numeric(legacy.bitacrosEarned),
    bitacros_gagnes:numeric(legacy.bitacrosgagnes),
    solde_de_bitacros:numeric(legacy.soldedebitacros),
    extra:Object.fromEntries(Object.entries(legacy).filter(([key])=>!known.includes(key)))
   };
   if(!row.first_name||!row.last_name)return json({error:"La fiche plongeur ne contient pas un nom et un prénom valides."},400);
   const {error:syncError}=await admin.from("acro_divers").upsert(row,{onConflict:"id"});
   if(syncError)return json({error:"Synchronisation de la fiche plongeur impossible : "+syncError.message},500);
  }else{
   let {data:diverRecord,error:diverLookupError}=await admin.from("acro_divers").select("id").eq("id",diverId).maybeSingle();
   if(diverLookupError)return json({error:"Vérification de la fiche plongeur impossible : "+diverLookupError.message},500);
   // Compatibilité avec les listes locales V124 : si l'identifiant transmis est ancien,
   // ne rattacher que si prénom + nom correspondent à une seule fiche du répertoire.
   if(!diverRecord){
    const {data:directory,error:directoryError}=await admin.from("acro_divers").select("id,first_name,last_name").limit(1000);
    if(directoryError)return json({error:"Recherche de la fiche plongeur impossible : "+directoryError.message},500);
    const matches=(directory||[]).filter((d:{id:string;first_name:string|null;last_name:string|null})=>normalize((d.first_name||"")+" "+(d.last_name||""))===normalize(fullName));
    if(matches.length===1){diverId=matches[0].id;diverRecord={id:diverId};}
    else if(matches.length>1)return json({error:"Plusieurs fiches portent ce nom. Actualise le répertoire et sélectionne la bonne fiche."},409);
   }
   if(!diverRecord)return json({error:"Fiche plongeur introuvable : l'identifiant transmis ne correspond à aucune fiche. Actualise la liste des plongeurs et réessaie."},400);
  }
 }
 if(action==="create"){
  const {data:profiles,error:listError}=await admin.from("acro_profiles").select("user_id,display_name,diver_id");
  if(listError)return json({error:"Impossible de vérifier les profils existants."},500);
  if((profiles||[]).some((p:{display_name:string|null})=>normalize(p.display_name||"")===normalize(fullName)))return json({error:"Un compte porte déjà ce nom et prénom. Vérifie les doublons."},409);
  if((profiles||[]).some((p:{diver_id:string|null})=>p.diver_id===diverId))return json({error:"Cette fiche plongeur possède déjà un compte d'accès."},409);
  const role=validRoles.includes(String(body.role))?String(body.role):"plongeur",permissions=cleanPermissions(body.permissions,role),syntheticEmail=`${crypto.randomUUID()}@members.acro.invalid`;
  const {data:newUser,error:createError}=await admin.auth.admin.createUser({email:syntheticEmail,password,email_confirm:true,user_metadata:{display_name:fullName,first_name:firstName,last_name:lastName}});
  if(createError||!newUser.user)return json({error:createError?.message||"Création du compte impossible."},400);
  const {error:profileInsertError}=await admin.from("acro_profiles").insert({user_id:newUser.user.id,display_name:fullName,role,is_active:true,diver_id:diverId,permissions});
  if(profileInsertError){console.error("member-access create: insertion profil échouée",profileInsertError.message);await admin.auth.admin.deleteUser(newUser.user.id);return json({error:"Création du profil impossible. Le compte temporaire a été annulé."},500)}
  return json({ok:true,user_id:newUser.user.id,display_name:fullName,role,is_active:true,diver_id:diverId,permissions});
 }
 if(action==="update"){
  const targetId=String(body.user_id||"").trim();
  if(!targetId)return json({error:"Identifiant Supabase du compte manquant."},400);
  if(targetId===masterUserId)return json({error:"La modification de son propre compte Master n'est pas autorisée ici."},400);
  const {data:target,error:targetError}=await admin.from("acro_profiles").select("user_id,display_name,role,is_active,diver_id,permissions").eq("user_id",targetId).maybeSingle();
  if(targetError||!target)return json({error:"Compte existant introuvable."},404);
  if(target.role==="master")return json({error:"Un compte Master est protégé contre la modification depuis cette interface."},403);
  const requestedRole=validRoles.includes(String(body.role))?String(body.role):"plongeur";
  if(requestedRole==="master")return json({error:"La promotion au rôle Master n'est pas autorisée ici."},403);
  const {data:profiles,error:listError}=await admin.from("acro_profiles").select("user_id,display_name,diver_id");
  if(listError)return json({error:"Vérification des profils impossible."},500);
  if((profiles||[]).some((p:{user_id:string;display_name:string|null})=>p.user_id!==targetId&&normalize(p.display_name||"")===normalize(fullName)))return json({error:"Un autre compte utilise déjà ce nom et prénom."},409);
  if((profiles||[]).some((p:{user_id:string;diver_id:string|null})=>p.user_id!==targetId&&p.diver_id===diverId))return json({error:"Cette fiche plongeur est déjà associée à un autre compte."},409);
  const {data:authTarget,error:authTargetError}=await admin.auth.admin.getUserById(targetId);
  if(authTargetError||!authTarget.user)return json({error:"Compte d'authentification introuvable."},404);
  const permissions=cleanPermissions(body.permissions,requestedRole);
  const profileUpdates:{display_name:string;role:string;is_active?:boolean;diver_id:string;permissions:string[]}={display_name:fullName,role:requestedRole,diver_id:diverId,permissions};
  if(typeof body.active==="boolean")profileUpdates.is_active=body.active;
  const {data:updatedProfile,error:profileUpdateError}=await admin.from("acro_profiles").update(profileUpdates).eq("user_id",targetId).select("user_id,display_name,role,is_active,diver_id,permissions").maybeSingle();
  if(profileUpdateError||!updatedProfile)return json({error:profileUpdateError?.message||"Le profil n'a pas pu être mis à jour."},500);
  // Le profil acro_profiles est la source de vérité pour le nom, le rôle et les droits.
  // Ne pas appeler Auth pour une simple modification de profil : cela évite qu'une
  // mise à jour inutile des métadonnées Auth fasse échouer toute la modification.
  // Auth n'est appelé que si le Master demande réellement un changement de mot de passe.
  if(password.length>0){
   const {error:authUpdateError}=await admin.auth.admin.updateUserById(targetId,{password});
   if(authUpdateError){
    const {error:rollbackError}=await admin.from("acro_profiles").update({display_name:target.display_name,role:target.role,is_active:target.is_active,diver_id:target.diver_id,permissions:target.permissions}).eq("user_id",targetId);
    if(rollbackError){console.error("member-access update: rollback profil échoué",rollbackError.message);return json({error:"Le changement de mot de passe a échoué et le retour arrière du profil a également échoué. Le profil doit être contrôlé dans Supabase avant toute nouvelle tentative."},500)}
    return json({error:"Le changement de mot de passe a été refusé par Supabase Auth : "+authUpdateError.message+". Le profil a été restauré."},400);
   }
  }
  return json({ok:true,user_id:targetId,display_name:fullName,role:updatedProfile.role,is_active:updatedProfile.is_active,diver_id:updatedProfile.diver_id,permissions:updatedProfile.permissions});
 }
 if(action==="set_active"){
  const targetId=String(body.user_id||"").trim();
  if(!targetId)return json({error:"Identifiant Supabase du compte manquant."},400);
  if(targetId===masterUserId)return json({error:"Tu ne peux pas désactiver ton propre compte Master."},400);
  const {data:target,error:targetError}=await admin.from("acro_profiles").select("user_id,role").eq("user_id",targetId).maybeSingle();
  if(targetError||!target)return json({error:"Compte existant introuvable."},404);
  if(target.role==="master")return json({error:"Un compte Master ne peut pas être désactivé depuis cette interface."},403);
  const {data:updated,error:updateError}=await admin.from("acro_profiles").update({is_active:body.active}).eq("user_id",targetId).select("user_id,is_active").maybeSingle();
  if(updateError||!updated)return json({error:updateError?.message||"État du compte non confirmé."},500);
  return json({ok:true,user_id:targetId,is_active:updated.is_active});
 }
 const {data:profiles,error:profileError}=await admin.from("acro_profiles").select("user_id,display_name,role,is_active");
 if(profileError)return json({error:"Lecture des profils impossible."},500);
 const matches=(profiles||[]).filter((p:{user_id:string;display_name:string|null;is_active:boolean})=>p.is_active===true&&normalize(p.display_name||"")===normalize(fullName));
 if(matches.length!==1){await auditLogin(false,"Identifiant inconnu ou compte désactivé.");return json({error:"Nom, prénom ou mot de passe incorrect, ou compte désactivé."},401);}
 const {data:authUser,error:authUserError}=await admin.auth.admin.getUserById(matches[0].user_id);
 if(authUserError||!authUser.user?.email){await auditLogin(false,"Compte membre indisponible.",matches[0].user_id);return json({error:"Compte membre indisponible. Contacte le Master."},401);}
 const publicClient=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:signedIn,error:signInError}=await publicClient.auth.signInWithPassword({email:authUser.user.email,password});
 if(signInError||!signedIn.session){await auditLogin(false,"Mot de passe incorrect ou compte désactivé.",matches[0].user_id);return json({error:"Nom, prénom ou mot de passe incorrect, ou compte désactivé."},401);}
 await auditLogin(true,"Connexion réussie",matches[0].user_id);
 return json({session:{access_token:signedIn.session.access_token,refresh_token:signedIn.session.refresh_token}});
});
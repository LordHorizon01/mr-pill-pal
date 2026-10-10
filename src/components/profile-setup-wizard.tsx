import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type ImageSourcePropType, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Animated, { Easing, FadeIn, FadeInLeft, FadeInRight, FadeOut } from "react-native-reanimated";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "@/components/app-theme-provider";
import { ProfileSetupShell } from "@/components/profile-setup-shell";
import { profileSetupColors, ui } from "@/components/ui-tokens";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { getAccountProfileSetupProgress, saveAccountProfileSetupDraft, startAccountProfileSetup, toAuthMessage } from "@/features/auth/auth.service";
import { getPrimerNotificationPermission, requestPrimerNotificationPermission } from "@/notifications/notification.service";
import { AccountProfileGender, AccountProfileRelationship, AccountProfileSetupDraft, AccountReminderPreference, clampDobDay, createDobValue, DOB_MIN_YEAR, getDobDaysInMonth, getProfileSetupAvatarUrl, nextTemporaryProfileName } from "@/features/profiles/profile-setup.domain";
import { getRemainingProfileSetupLoadingMs, PROFILE_SETUP_READY_REDUCED_VISIBLE_MS, PROFILE_SETUP_READY_VISIBLE_MS } from "@/features/first-run/handoff.domain";
import { useAuthStore } from "@/state/auth.store";
import { useProfileStore } from "@/state/profile.store";

type Step = AccountProfileSetupDraft["activeStep"];
type Palette = typeof profileSetupColors.light | typeof profileSetupColors.dark;
const screens = {
  name: require("../../assets/ui/screens/kyc-name/png/kyc-name-profile.png"),
  gender: require("../../assets/ui/screens/kyc-gender/png/kyc-gender-identity.png"),
  dob: require("../../assets/ui/screens/kyc-dob/png/kyc-dob-calendar.png"),
  avatar: require("../../assets/ui/screens/kyc-avatar/png/kyc-avatar-hero.png"),
  type: require("../../assets/ui/screens/kyc-profile-type/png/kyc-profile-type.png"),
  relationship: require("../../assets/ui/screens/kyc-relationship/png/kyc-relationship.png"),
  reminder: require("../../assets/ui/screens/kyc-reminder/png/kyc-reminder.png"),
  handoff: require("../../assets/ui/screens/setup-handoff/png/setup-handoff.png"),
};
const neutral = require("../../assets/ui/shared/png/avatar-neutral.png");
const male = require("../../assets/ui/shared/png/avatar-male.png");
const female = require("../../assets/ui/shared/png/avatar-female.png");
const presetImages: ImageSourcePropType[] = [
  require("../../assets/ui/shared/avatars/avatar-preset-01.png"), require("../../assets/ui/shared/avatars/avatar-preset-02.png"),
  require("../../assets/ui/shared/avatars/avatar-preset-03.png"), require("../../assets/ui/shared/avatars/avatar-preset-04.png"),
  require("../../assets/ui/shared/avatars/avatar-preset-05.png"), require("../../assets/ui/shared/avatars/avatar-preset-06.png"),
  require("../../assets/ui/shared/avatars/avatar-preset-07.png"), require("../../assets/ui/shared/avatars/avatar-preset-08.png"),
];
const presetKeys = [1,2,3,4,5,6,7,8].map(n => "avatar-preset-" + String(n).padStart(2,"0"));
const genderOptions: Array<[AccountProfileGender,string]> = [["man","Male"],["woman","Female"],["nonbinary","Non-binary"],["prefer_not_to_say","Prefer not to say"],["other","Other"]];
const relationOptions: Array<[AccountProfileRelationship,string]> = [["parent","Parent"],["partner","Partner"],["child","Child"],["relative","Relative"],["friend","Friend"],["other","Other"]];
const reminderOptions: Array<[AccountReminderPreference,string]> = [["sound_vibration","Sound + vibration"],["sound","Sound"],["vibration","Vibration"],["quiet","Quiet"]];
const steps: Step[] = ["name","gender","dob","avatar","profileType","relationship","reminder","review"];
const labels: Record<Step,string> = { name:"Name",gender:"Gender",dob:"Date of birth",avatar:"Profile photo",profileType:"Profile type",relationship:"Relationship",reminder:"Reminder preference",review:"Profile details",handoff:"Setup" };
const blank: AccountProfileSetupDraft = { displayName:null,gender:null,genderOther:null,dateOfBirth:null,avatarUri:null,avatarPreset:null,profileType:null,relationship:null,relationshipOther:null,reminderPreference:null,activeStep:"name" };
const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const wheelMonths = monthNames.map((label,index)=>({value:index+1,label:label.slice(0,3),spoken:label}));
const wheelRowHeight = 40;
const wheelVisibleHeight = wheelRowHeight * 5;
const wheelVerticalInset = wheelRowHeight * 2;

function getInitialDobValue(now = new Date()): string {
  const year = Math.max(DOB_MIN_YEAR, now.getFullYear() - 30);
  return createDobValue(year, now.getMonth() + 1, clampDobDay(year, now.getMonth() + 1, now.getDate()));
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function ProfileSetupWizard({ onExit }: { onExit: () => void }) {
  const user = useAuthStore(s => s.user);
  const setProfileReady = useAuthStore(s => s.setProfileReady);
  const profiles = useProfileStore(s => s.profiles);
  const createProfile = useProfileStore(s => s.createProfile);
  const { mode } = useAppTheme();
  const colors = profileSetupColors[mode];
  const reduceMotion = useReducedMotion();
  const { height } = useWindowDimensions();
  const [draft,setDraft] = useState(blank);
  const [step,setStep] = useState<Step>("name");
  const [ready,setReady] = useState(false);
  const [busy,setBusy] = useState(false);
  const [keyboardOpen,setKeyboardOpen] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const [direction,setDirection] = useState<"forward"|"back">("forward");
  const [dobPreview,setDobPreview] = useState(getInitialDobValue);
  const [dobTouched,setDobTouched] = useState(false);
  const [handoffPhase,setHandoffPhase] = useState<"setting-up"|"ready"|null>(null);
  const editReturn = useRef(false);
  const lock = useRef(false);
  const draftRef = useRef(draft);
  useEffect(()=>{draftRef.current=draft;},[draft]);
  useEffect(() => {
    const a=Keyboard.addListener(Platform.OS==="ios"?"keyboardWillShow":"keyboardDidShow",()=>setKeyboardOpen(true));
    const b=Keyboard.addListener(Platform.OS==="ios"?"keyboardWillHide":"keyboardDidHide",()=>setKeyboardOpen(false));
    return()=>{a.remove();b.remove();};
  },[]);
  useEffect(() => {
    if(!user)return;
    let active=true;
    void getAccountProfileSetupProgress(user.uid,profiles.length>0).then(async result=>{
      if(result.state==="NOT_STARTED")await startAccountProfileSetup(user.uid);
      if(!active)return;
      const d={...blank,...result.draft};
      draftRef.current=d;setDraft(d);setStep(d.activeStep==="handoff"?"review":d.activeStep);
      if(d.dateOfBirth){setDobPreview(d.dateOfBirth);setDobTouched(true);}
      setReady(true);
    }).catch(e=>{if(active){setError(toAuthMessage(e,"We couldn't restore your setup. Check your connection and try again."));setReady(true);}});
    return()=>{active=false;};
  },[user?.uid]);
  const shownSteps = useMemo(()=>steps.filter(s=>s!=="relationship"||draft.profileType==="care_for"),[draft.profileType]);
  const imageSource=avatarFor(draft);
  const artHeight=step==="dob"?Math.min(height*0.15,112):step==="avatar"?Math.min(height*0.24,176):Math.min(height*(keyboardOpen?0.18:0.32),keyboardOpen?155:250);
  const entering=reduceMotion?FadeIn.duration(160):(direction==="forward"?FadeInRight:FadeInLeft).duration(320).easing(Easing.bezier(0.2,0,0,1));

  async function persist(next:Step, patch:Partial<AccountProfileSetupDraft>={}) {
    if(!user||lock.current)return false;
    lock.current=true;setBusy(true);setError(null);
    const d={...draftRef.current,...patch,activeStep:next};
    try {
      await saveAccountProfileSetupDraft(user.uid,d);draftRef.current=d;setDraft(d);
      if(editReturn.current){editReturn.current=false;setDirection("back");setStep("review");const review={...d,activeStep:"review" as const};draftRef.current=review;setDraft(review);await saveAccountProfileSetupDraft(user.uid,review);}
      else {setDirection(next==="name"?"back":"forward");setStep(next);}
      return true;
    } catch(e){setError(toAuthMessage(e,"Your answer wasn't saved. Please try again."));return false;}
    finally{lock.current=false;setBusy(false);}
  }
  function back(){
    const i=shownSteps.indexOf(step);
    if(i<=0){Alert.alert("Leave profile setup?","Your saved answers will be here when you sign in again.",[{text:"Continue setup",style:"cancel"},{text:"Sign out",style:"destructive",onPress:onExit}]);return;}
    setDirection("back");setStep(shownSteps[i-1]);
  }
  async function choosePhoto(){
    try{
      setError(null);
      const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],allowsEditing:true,aspect:[1,1],quality:0.9});
      if(result.canceled)return;
      let uri=result.assets[0].uri;
      if(FileSystem.documentDirectory){
        const dir=FileSystem.documentDirectory+"profile-avatars/";
        const info=await FileSystem.getInfoAsync(dir);
        if(!info.exists)await FileSystem.makeDirectoryAsync(dir,{intermediates:true});
        const ext=uri.split(".").pop()?.split("?")[0]||"jpg";
        const target=dir+encodeURIComponent(user?.uid??"account")+"-profile."+ext;
        await FileSystem.copyAsync({from:uri,to:target});uri=target;
      }
      const next={...draftRef.current,avatarUri:uri,avatarPreset:null};draftRef.current=next;setDraft(next);
    }catch(e){setError(toAuthMessage(e,"Couldn't use that photo. Choose another image or select an avatar."));}
  }
  async function allowNotifications(){
    setBusy(true);setError(null);
    try{const result=await requestPrimerNotificationPermission();setError(result.status==="granted"?"Notifications are enabled on this device.":"Permission wasn't granted. You can enable it later in Settings.");}
    catch(e){setError(toAuthMessage(e,"We couldn't request notification permission."));}
    finally{setBusy(false);}
  }
  async function finish(){
    if(!user||lock.current)return;
    lock.current=true;setBusy(true);setError(null);
    const startedAt=Date.now();
    setHandoffPhase("setting-up");
    try{
      const currentDraft=draftRef.current;
      const avatarUrl=getProfileSetupAvatarUrl(currentDraft);
      await createProfile({fullName:currentDraft.displayName?.trim()||nextTemporaryProfileName(profiles.map(p=>p.fullName)),dateOfBirth:currentDraft.dateOfBirth??undefined,relationship:profileRelationship(currentDraft),avatarUrl},{deferAuthReady:true});
      const loadingWait=getRemainingProfileSetupLoadingMs(startedAt,Date.now(),reduceMotion);
      if(loadingWait)await wait(loadingWait);
      setHandoffPhase("ready");
      await wait(reduceMotion?PROFILE_SETUP_READY_REDUCED_VISIBLE_MS:PROFILE_SETUP_READY_VISIBLE_MS);
      setProfileReady(true);
    }catch(e){setHandoffPhase(null);setError(toAuthMessage(e,"We couldn't finish setup. Your answers are saved; please try again."));lock.current=false;setBusy(false);}
  }
  function edit(target:Exclude<Step,"review"|"handoff">){
    editReturn.current=true;setDirection("back");setStep(target);
    const d={...draft,activeStep:target};draftRef.current=d;setDraft(d);
    if(user)void saveAccountProfileSetupDraft(user.uid,d).catch(e=>setError(toAuthMessage(e,"Your edit couldn't be saved.")));
  }
  if(!ready)return <SafeAreaView style={[s.waiting,{backgroundColor:colors.canvas}]}><ActivityIndicator color={colors.teal}/><Text style={{color:colors.textSecondary}}>Restoring your profile setup...</Text></SafeAreaView>;
  if(handoffPhase)return <SafeAreaView style={[s.handoff,{backgroundColor:colors.canvas}]}><Animated.View key={handoffPhase} entering={FadeIn.duration(reduceMotion?160:220)} exiting={FadeOut.duration(reduceMotion?120:180)} style={s.handoffInner}><Image source={screens.handoff} resizeMode="contain" accessible accessibilityLabel="Preparing your medication space" style={s.handoffImage}/><Text accessibilityRole="header" style={[s.handoffTitle,{color:colors.text}]}>{handoffPhase==="ready"?"You're all set":"Setting things up for you"}</Text><Text style={[s.handoffSupport,{color:colors.textSecondary}]}>{handoffPhase==="ready"?"Your medication space is ready.":"Preparing your medication space."}</Text>{handoffPhase==="ready"?<View accessibilityLabel="Setup complete" accessibilityRole="image" style={[s.handoffReady,{backgroundColor:colors.primarySoft}]}><Text style={{color:colors.teal,fontSize:17,fontWeight:"800"}}>✓</Text></View>:<ActivityIndicator accessibilityLabel="Setting things up" size={30} color={colors.teal} style={s.handoffLoader}/>}</Animated.View></SafeAreaView>;
  const stepIndex=shownSteps.indexOf(step);
  const skip=step==="name"?()=>void persist("gender",{displayName:draft.displayName?.trim()||nextTemporaryProfileName(profiles.map(p=>p.fullName))}):step==="gender"?()=>void persist("dob",{gender:null,genderOther:null}):step==="dob"?()=>{setDobPreview(getInitialDobValue());setDobTouched(false);void persist("avatar",{dateOfBirth:null});}:step==="avatar"?()=>void persist("profileType",{avatarUri:null,avatarPreset:null}):step==="profileType"?()=>void persist("reminder",{profileType:null,relationship:null,relationshipOther:null}):step==="relationship"?()=>void persist("reminder",{relationship:null,relationshipOther:null}):step==="reminder"?()=>void persist("review",{reminderPreference:null}):undefined;
  let visual:React.ReactNode;
  if(step==="reminder")visual=<View style={s.reminderArt}><ArtImage source={screens.reminder} maxHeight={artHeight*0.84} label="Reminder choices"/><AvatarPreview source={imageSource} size={72} colors={colors} label={draft.displayName||"Selected profile"}/></View>;
  else if(step==="review")visual=<View style={s.reviewArt}><AvatarPreview source={imageSource} size={116} colors={colors} label={draft.displayName||"Selected profile"}/></View>;
  else if(step==="avatar"){const hasSelection=Boolean(draft.avatarUri||draft.avatarPreset);visual=<View style={s.avatarHeroFrame}><Animated.View key={draft.avatarUri??draft.avatarPreset??"context"} entering={FadeIn.duration(reduceMotion?140:210)} exiting={FadeOut.duration(reduceMotion?100:150)} style={s.avatarHeroContent}>{hasSelection?<AvatarPreview source={imageSource} size={158} colors={colors} label={draft.displayName||"Selected profile avatar"}/>:<ArtImage source={screens.avatar} maxHeight={artHeight} label="Choose a profile picture"/>}</Animated.View></View>;}
  else visual=<View style={s.artWrap}><ArtImage source={step==="profileType"?screens.type:screens[step]} maxHeight={artHeight} label={labels[step]}/>{step==="name"&&draft.displayName?.trim()?<View pointerEvents="none" style={[s.initial,{backgroundColor:colors.coral}]}><Text style={[s.initialText,{color:colors.onTeal}]}>{draft.displayName.trim()[0].toUpperCase()}</Text></View>:null}{step==="profileType"?<View style={s.avatarOverlay}><AvatarPreview source={imageSource} size={66} colors={colors} label={draft.displayName||"Selected profile"}/></View>:null}</View>;
  return <ProfileSetupShell step={stepIndex+1} totalSteps={shownSteps.length} onBack={back} onSkip={skip} backDisabled={busy} skipDisabled={busy} visual={<Animated.View key={step+"-art"} entering={entering}>{visual}</Animated.View>}>
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS==="ios"?"padding":undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.scroll}><Animated.View key={step} entering={entering} style={[s.card,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <Text accessibilityRole="header" style={[s.question,{color:colors.text}]}>{question(step)}</Text>
      {step==="name"?<><Text style={[s.support,{color:colors.textSecondary}]}>A name makes it easier to tell profiles apart.</Text><TextInput accessibilityLabel="Profile name, optional" value={draft.displayName??""} onChangeText={v=>setDraft(d=>({...d,displayName:v}))} placeholder="For example, Asha Sharma" placeholderTextColor={colors.textMuted} autoCapitalize="words" returnKeyType="done" style={[s.input,{backgroundColor:colors.surfaceSubtle,color:colors.textPrimary,borderColor:colors.border}]}/></>:null}
      {step==="gender"?<><Text style={[s.support,{color:colors.textSecondary}]}>Optional. This does not affect medication guidance.</Text><View style={[s.grid,s.genderGrid]}>{genderOptions.map(([v,l])=><Choice key={v} label={l} selected={draft.gender===v} colors={colors} onPress={()=>setDraft(d=>({...d,gender:v,genderOther:v==="other"?d.genderOther:null}))}/>)}</View>{draft.gender==="other"?<TextInput accessibilityLabel="Optional gender description" value={draft.genderOther??""} onChangeText={v=>setDraft(d=>({...d,genderOther:v}))} placeholder="Describe it in your own words (optional)" placeholderTextColor={colors.textMuted} style={[s.input,{backgroundColor:colors.surfaceSubtle,color:colors.textPrimary,borderColor:colors.border}]}/>:null}</>:null}
      {step==="dob"?<DobWheel value={dobPreview} hasSelection={dobTouched||Boolean(draft.dateOfBirth)} onChange={v=>{setError(null);setDobPreview(v);setDobTouched(true);const next={...draftRef.current,dateOfBirth:v};draftRef.current=next;setDraft(next);}} colors={colors} today={new Date()}/>:null}
      {step==="avatar"?<><Text style={[s.support,{color:colors.textSecondary}]}>Choose a photo or preset avatar, or skip for now.</Text><Pressable accessibilityRole="button" onPress={()=>void choosePhoto()} style={[s.photoButton,{backgroundColor:colors.mint,borderColor:colors.borderStrong}]}><Text style={[s.choiceText,{color:colors.teal}]}>Add photo / choose from device</Text></Pressable><View style={s.avatarGrid}>{presetKeys.map((key,i)=>{const selected=draft.avatarPreset===key&&!draft.avatarUri;return <Pressable key={key} accessibilityRole="radio" accessibilityLabel={"Preset avatar "+key.slice(-2)} accessibilityState={{checked:selected,selected}} onPress={()=>{const next={...draftRef.current,avatarPreset:key,avatarUri:null};draftRef.current=next;setDraft(next);}} style={[s.avatarOption,{borderColor:selected?colors.teal:colors.border,borderWidth:selected?3:1}]}><Image source={presetImages[i]} resizeMode="contain" style={s.avatarImage}/>{selected?<View accessible={false} style={s.avatarCheckBadge}><Text style={[s.avatarCheck,{color:colors.teal}]}>✓</Text></View>:null}</Pressable>;})}</View></>:null}
      {step==="profileType"?<><Text style={[s.support,{color:colors.textSecondary}]}>Who will this profile help?</Text><View style={s.typeGrid}>{([{value:"me",label:"Me",mark:"M"},{value:"care_for",label:"Someone I care for",mark:"♡"}] as const).map(x=><Pressable key={x.value} accessibilityRole="radio" accessibilityLabel={x.label} accessibilityState={{checked:draft.profileType===x.value}} onPress={()=>setDraft(d=>({...d,profileType:x.value,relationship:x.value==="me"?null:d.relationship}))} style={[s.typeChoice,{backgroundColor:draft.profileType===x.value?colors.mint:colors.surface,borderColor:draft.profileType===x.value?colors.teal:colors.border}]}><Text style={[s.typeMark,{color:colors.teal}]}>{x.mark}</Text><Text style={[s.typeLabel,{color:colors.text}]}>{x.label}</Text>{draft.profileType===x.value?<Text style={{color:colors.teal,fontWeight:"900"}}>✓</Text>:null}</Pressable>)}</View></>:null}
      {step==="relationship"?<><Text style={[s.support,{color:colors.textSecondary}]}>Optional - choose the closest fit.</Text><View style={s.grid}>{relationOptions.map(([v,l])=><Choice key={v} label={l} selected={draft.relationship===v} colors={colors} onPress={()=>setDraft(d=>({...d,relationship:v}))}/>)}</View>{draft.relationship==="other"?<TextInput accessibilityLabel="Optional relationship description" value={draft.relationshipOther??""} onChangeText={v=>setDraft(d=>({...d,relationshipOther:v}))} placeholder="Add a detail (optional)" placeholderTextColor={colors.textSecondary} style={[s.input,{backgroundColor:colors.canvas,color:colors.text,borderColor:colors.borderStrong}]}/>:null}</>:null}
      {step==="reminder"?<><Text style={[s.support,{color:colors.textSecondary}]}>Choose a reminder style. Your device may control the final sound or vibration.</Text><ReminderSettings value={draft.reminderPreference} colors={colors} onChange={v=>setDraft(d=>({...d,reminderPreference:v}))} onEnable={()=>void allowNotifications()}/></>:null}
      {step==="review"?<Review draft={draft} colors={colors} onEdit={edit}/>:null}
      {error?<Text accessibilityRole="alert" style={[s.error,{color:colors.error,backgroundColor:colors.errorSurface}]}>{error}</Text>:null}
    </Animated.View></ScrollView><Pressable accessibilityRole="button" accessibilityState={{busy,disabled:busy}} disabled={busy} onPress={()=>{
      if(step==="name")void persist("gender",{displayName:draft.displayName?.trim()||nextTemporaryProfileName(profiles.map(p=>p.fullName))});
      else if(step==="gender")void persist("dob",{});
      else if(step==="dob")void persist("avatar",{dateOfBirth:dobTouched?dobPreview:(draftRef.current.dateOfBirth??dobPreview)});
      else if(step==="avatar")void persist("profileType",{});
      else if(step==="profileType")void persist(draft.profileType==="care_for"?"relationship":"reminder",draft.profileType==="me"?{relationship:null,relationshipOther:null}:{});
      else if(step==="relationship")void persist("reminder",{});
      else if(step==="reminder")void persist("review",{});
      else if(step==="review")void finish();
    }} style={[s.action,{backgroundColor:colors.teal},busy&&s.disabled]}>{busy&&step==="review"?<ActivityIndicator color={colors.onTeal}/>:null}<Text style={[s.actionText,{color:colors.onTeal}]}>{step==="review"?"Finish setup":"Continue"}</Text></Pressable></KeyboardAvoidingView>
  </ProfileSetupShell>;
}
function question(step:Step){return({name:"What should we call this profile?",gender:"How do you identify?",dob:"When were you born?",avatar:"Choose a profile photo",profileType:"Who is this profile for?",relationship:"How are you connected?",reminder:"How should reminders feel?",review:"Profile details",handoff:"Setting things up for you"} as const)[step];}
function avatarFor(d:AccountProfileSetupDraft):ImageSourcePropType{if(d.avatarUri)return{uri:d.avatarUri};if(d.avatarPreset)return presetImages[presetKeys.indexOf(d.avatarPreset)]??neutral;if(d.gender==="man")return male;if(d.gender==="woman")return female;return neutral;}
function profileRelationship(d:AccountProfileSetupDraft){if(d.profileType==="me")return"Self" as const;switch(d.relationship){case"partner":return"Spouse" as const;case"child":return"Child" as const;case"friend":case"other":return"Other" as const;default:return"Family member" as const;}}
function dateLabel(v:string){const[y,m,d]=v.split("-").map(Number);return String(d).padStart(2,"0")+" "+monthNames[m-1]+" "+String(y);}
function ArtImage({source,maxHeight,label}:{source:ImageSourcePropType;maxHeight:number;label:string}){return <Image source={source} resizeMode="contain" accessible={false} accessibilityLabel={label} style={{width:"100%",maxWidth:390,aspectRatio:4/3,maxHeight}}/>;}
function AvatarPreview({source,size,colors,label}:{source:ImageSourcePropType;size:number;colors:Palette;label:string}){return <View style={[s.avatarPreview,{width:size,height:size,borderColor:colors.border,backgroundColor:colors.surface}]}><Image source={source} resizeMode="contain" accessible accessibilityRole="image" accessibilityLabel={label} style={{width:"100%",height:"100%"}}/></View>;}
function Choice({label,selected,onPress,colors}:{label:string;selected:boolean;onPress:()=>void;colors:Palette}){return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:selected}} onPress={onPress} style={[s.choice,{backgroundColor:selected?colors.primarySoft:colors.surfaceSubtle,borderColor:selected?colors.primary:colors.borderStrong}]}><Text style={[s.choiceText,{color:colors.textPrimary}]}>{label}</Text><View style={[s.choiceCheckCircle,{borderColor:selected?colors.primary:colors.borderStrong,backgroundColor:selected?colors.primary:"transparent"}]}>{selected?<Animated.Text entering={FadeIn.duration(170)} style={{color:colors.onPrimary,fontWeight:"900"}}>✓</Animated.Text>:null}</View></Pressable>;}
type WheelItem = { value: number; label: string; spoken: string };

function DobWheel({value,hasSelection,onChange,colors,today}:{value:string;hasSelection:boolean;onChange:(value:string)=>void;colors:Palette;today:Date}) {
  const [yearValue,monthValue,dayValue]=value.split("-").map(Number);
  const year=Math.min(yearValue,today.getFullYear());
  const maxMonth=year===today.getFullYear()?today.getMonth()+1:12;
  const month=Math.min(monthValue,maxMonth);
  const monthDays=getDobDaysInMonth(year,month);
  const maxDay=year===today.getFullYear()&&month===today.getMonth()+1?Math.min(monthDays,today.getDate()):monthDays;
  const day=clampDobDay(year,month,Math.min(dayValue,maxDay));
  const years:WheelItem[]=Array.from({length:Math.max(1,today.getFullYear()-DOB_MIN_YEAR+1)},(_,index)=>{const value=today.getFullYear()-index;return{value,label:String(value),spoken:String(value)};});
  const months=wheelMonths.slice(0,maxMonth);
  const days:WheelItem[]=Array.from({length:maxDay},(_,index)=>{const value=index+1;return{value,label:String(value).padStart(2,"0"),spoken:String(value)};});
  return <View style={[s.wheel,{backgroundColor:colors.surfaceSubtle,borderColor:colors.border}]}>
    <View style={s.wheelHeadings}><Text style={[s.wheelHeading,{color:colors.textSecondary}]}>DATE</Text><Text style={[s.wheelHeading,{color:colors.textSecondary}]}>MONTH</Text><Text style={[s.wheelHeading,{color:colors.textSecondary}]}>YEAR</Text></View>
    <View style={s.wheelColumns}>
      <WheelColumn label="Date" items={days} selectedIndex={day-1} colors={colors} onSelect={next=>onChange(createDobValue(year,month,clampDobDay(year,month,next)))}/>
      <WheelColumn label="Month" items={months} selectedIndex={month-1} colors={colors} onSelect={next=>{const nextMonth=Number(next);onChange(createDobValue(year,nextMonth,clampDobDay(year,nextMonth,day)));}}/>
      <WheelColumn label="Year" items={years} selectedIndex={today.getFullYear()-year} colors={colors} onSelect={next=>{const nextYear=Number(next);const nextMonth=Math.min(month,nextYear===today.getFullYear()?today.getMonth()+1:12);const nextDayMax=nextYear===today.getFullYear()&&nextMonth===today.getMonth()+1?Math.min(getDobDaysInMonth(nextYear,nextMonth),today.getDate()):getDobDaysInMonth(nextYear,nextMonth);onChange(createDobValue(nextYear,nextMonth,Math.min(day,nextDayMax)));}}/>
    </View>
    <View pointerEvents="none" style={[s.wheelSelectionBand,{backgroundColor:colors.primarySoft,borderColor:colors.primary}]}/>
    <Text accessibilityLiveRegion="polite" style={[s.selectedDate,{color:hasSelection?colors.primary:colors.textSecondary}]}>{hasSelection?dateLabel(value):"Optional - select a date or continue to confirm"}</Text>
  </View>;
}

function WheelColumn({label,items,selectedIndex,colors,onSelect}:{label:string;items:WheelItem[];selectedIndex:number;colors:Palette;onSelect:(value:number)=>void}) {
  const listRef=useRef<FlatList<WheelItem>>(null);
  const [laidOut,setLaidOut]=useState(false);
  useEffect(()=>{if(!laidOut)return;requestAnimationFrame(()=>listRef.current?.scrollToOffset({offset:selectedIndex*wheelRowHeight,animated:false}));},[laidOut,selectedIndex,items.length]);
  const settle=(event:NativeSyntheticEvent<NativeScrollEvent>)=>{
    const raw=Math.round(event.nativeEvent.contentOffset.y/wheelRowHeight);
    const index=Math.min(Math.max(raw,0),items.length-1);
    if(items[index])onSelect(items[index].value);
  };
  return <View style={s.wheelColumn}>
    <FlatList
      ref={listRef}
      accessibilityLabel={label}
      data={items}
      keyExtractor={item=>String(item.value)}
      showsVerticalScrollIndicator={false}
      bounces={false}
      decelerationRate="fast"
      snapToInterval={wheelRowHeight}
      snapToAlignment="start"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{paddingVertical:wheelVerticalInset}}
      getItemLayout={(_,index)=>({length:wheelRowHeight,offset:index*wheelRowHeight,index})}
      onLayout={()=>setLaidOut(true)}
      onScrollEndDrag={settle}
      onMomentumScrollEnd={settle}
      renderItem={({item,index})=>{
        const distance=Math.abs(index-selectedIndex);
        const selected=index===selectedIndex;
        return <Pressable
          accessibilityRole="button"
          accessibilityLabel={label + ", " + item.spoken}
          accessibilityState={{selected}}
          onPress={()=>{listRef.current?.scrollToOffset({offset:index*wheelRowHeight,animated:false});onSelect(item.value);}}
          style={s.wheelRow}
        ><Text style={[s.wheelValue,{color:selected?colors.teal:colors.textSecondary,opacity:selected?1:distance===1?0.72:0.5,fontWeight:selected?"800":"600"}]}>{item.label}</Text></Pressable>;
      }}
    />
  </View>;
}
function ReminderSettings({value,colors,onChange,onEnable}:{value:AccountReminderPreference|null;colors:Palette;onChange:(v:AccountReminderPreference)=>void;onEnable:()=>void}){const[unresolved,setUnresolved]=useState(false);useEffect(()=>{let active=true;void getPrimerNotificationPermission().then(p=>{if(active)setUnresolved(p.status==="not_requested");}).catch(()=>{if(active)setUnresolved(true);});return()=>{active=false;};},[]);return <><View style={s.reminderGrid}>{reminderOptions.map(([v,label])=><Pressable key={v} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:value===v}} onPress={()=>onChange(v)} style={[s.reminderOption,{backgroundColor:value===v?colors.mint:colors.surface,borderColor:value===v?colors.teal:colors.border}]}><Text style={[s.reminderLabel,{color:colors.text}]}>{label}</Text><Text style={[s.reminderHint,{color:colors.textSecondary}]}>Your device settings apply</Text>{value===v?<Text style={{color:colors.teal,fontWeight:"900"}}>✓</Text>:null}</Pressable>)}</View>{unresolved?<View style={[s.primer,{backgroundColor:colors.mint}]}><Text style={{color:colors.text,fontSize:13,lineHeight:18}}>Allow notifications so Mr. Pill Pal can tell you when a scheduled dose is due.</Text><Pressable accessibilityRole="button" onPress={onEnable} style={s.enable}><Text style={{color:colors.teal,fontWeight:"800"}}>Enable notifications</Text></Pressable></View>:null}</>;}
function Review({draft,colors,onEdit}:{draft:AccountProfileSetupDraft;colors:Palette;onEdit:(step:Exclude<Step,"review"|"handoff">)=>void}){const groups:Array<{title:string;rows:Array<{label:string;value:string|null;step:Exclude<Step,"review"|"handoff">}>}>=[{title:"Personal details",rows:[{label:"Name",value:draft.displayName,step:"name"},{label:"Gender",value:draft.gender?(draft.gender==="other"?draft.genderOther||"Other":genderOptions.find(x=>x[0]===draft.gender)?.[1]??null):null,step:"gender"},{label:"Date of birth",value:draft.dateOfBirth?dateLabel(draft.dateOfBirth):null,step:"dob"}]},{title:"Profile and reminders",rows:[{label:"Profile type",value:draft.profileType==="me"?"Me":draft.profileType==="care_for"?"Someone I care for":null,step:"profileType"},...(draft.profileType==="care_for"?[{label:"Relationship",value:draft.relationship?((relationOptions.find(x=>x[0]===draft.relationship)?.[1]??"Other")+(draft.relationship==="other"&&draft.relationshipOther?" - "+draft.relationshipOther:"")):null,step:"relationship" as const}]:[]),{label:"Reminder preference",value:draft.reminderPreference?reminderOptions.find(x=>x[0]===draft.reminderPreference)?.[1]??null:null,step:"reminder"},{label:"Photo",value:draft.avatarUri?"Photo chosen":draft.avatarPreset?"Preset avatar":null,step:"avatar"}]}];return <><View style={s.reviewPerson}><Text style={[s.reviewName,{color:colors.textPrimary}]}>{draft.displayName||"Your profile"}</Text><Text style={[s.reviewCaption,{color:colors.textSecondary}]}>Review your choices. You can change any detail.</Text></View>{groups.map(group=><View key={group.title} style={[s.reviewGroup,{backgroundColor:colors.surfaceSubtle}]}><Text style={[s.reviewGroupTitle,{color:colors.textPrimary}]}>{group.title}</Text>{group.rows.map(r=><View key={r.label} style={s.reviewRow}><View style={{flex:1}}><Text style={[s.reviewLabel,{color:colors.textSecondary}]}>{r.label}</Text><Text style={[s.reviewValue,{color:r.value?colors.textPrimary:colors.textSecondary}]}>{r.value??"Not added"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={(r.value?"Edit ":"Add ")+r.label} onPress={()=>onEdit(r.step)} style={s.edit}><Text style={{color:colors.primary,fontWeight:"800"}}>{r.value?"Edit":"Add"}</Text></Pressable></View>)}</View>)}</>;}
const s=StyleSheet.create({
  flex:{flex:1},waiting:{flex:1,justifyContent:"center",alignItems:"center",gap:12},scroll:{flexGrow:1,justifyContent:"center",paddingBottom:8},card:{borderWidth:1,borderRadius:18,padding:ui.spacing.md,gap:8},question:{fontSize:25,lineHeight:32,fontWeight:"800"},support:{fontSize:14,lineHeight:20,marginBottom:7},input:{minHeight:50,borderWidth:1,borderRadius:12,paddingHorizontal:14,fontSize:16,marginTop:8},
  grid:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:5},genderGrid:{justifyContent:"center"},choice:{width:"48%",minHeight:48,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:12,borderWidth:1,borderRadius:14,gap:6},choiceText:{flexShrink:1,fontSize:14,fontWeight:"700"},choiceCheckCircle:{width:20,height:20,borderRadius:10,borderWidth:1,alignItems:"center",justifyContent:"center"},
  wheel:{position:"relative",borderWidth:1,borderRadius:16,paddingHorizontal:8,paddingVertical:6,marginTop:2,overflow:"hidden"},wheelHeadings:{height:18,flexDirection:"row",alignItems:"center",marginBottom:2},wheelHeading:{flex:1,textAlign:"center",fontSize:10,fontWeight:"800",letterSpacing:0.6},wheelColumns:{height:wheelVisibleHeight,flexDirection:"row",overflow:"hidden"},wheelColumn:{flex:1,minWidth:0,height:wheelVisibleHeight},wheelRow:{height:wheelRowHeight,alignItems:"center",justifyContent:"center"},wheelValue:{fontSize:16,fontVariant:["tabular-nums"]},wheelSelectionBand:{position:"absolute",top:6+18+2+wheelVerticalInset,left:8,right:8,height:wheelRowHeight,borderWidth:1,borderRadius:11},selectedDate:{textAlign:"center",minHeight:18,paddingTop:3,fontSize:12,fontWeight:"700"},
  photoButton:{minHeight:48,alignItems:"center",justifyContent:"center",borderWidth:1,borderRadius:12},avatarGrid:{flexDirection:"row",flexWrap:"wrap",justifyContent:"center",gap:7,marginTop:9},avatarOption:{width:"22%",aspectRatio:1,borderRadius:999,borderWidth:2,padding:3},avatarImage:{width:"100%",height:"100%"},avatarCheckBadge:{position:"absolute",right:-5,top:-5,width:21,height:21,borderRadius:11,alignItems:"center",justifyContent:"center",backgroundColor:"white",borderWidth:1,borderColor:"white"},avatarCheck:{fontWeight:"900"},
  typeGrid:{flexDirection:"row",gap:8,marginTop:5},typeChoice:{flex:1,minHeight:60,flexDirection:"row",alignItems:"center",gap:6,borderWidth:1,borderRadius:14,paddingHorizontal:8},typeMark:{fontSize:20,fontWeight:"900"},typeLabel:{flex:1,fontSize:13,fontWeight:"700"},
  reminderGrid:{flexDirection:"row",flexWrap:"wrap",gap:8},reminderOption:{position:"relative",width:"48%",minHeight:64,borderWidth:1,borderRadius:13,justifyContent:"center",paddingHorizontal:8},reminderLabel:{fontSize:13,fontWeight:"800",paddingRight:12},reminderHint:{fontSize:10,marginTop:3},primer:{marginTop:9,padding:11,borderRadius:12,gap:5},enable:{minHeight:42,justifyContent:"center"},
  reviewPerson:{alignItems:"center",gap:5,marginBottom:4},avatarPreview:{borderRadius:999,borderWidth:2,overflow:"hidden",padding:2,alignItems:"center",justifyContent:"center"},reviewName:{fontSize:20,fontWeight:"800"},reviewCaption:{fontSize:13,lineHeight:18,textAlign:"center"},reviewGroup:{borderRadius:16,paddingHorizontal:12,paddingVertical:8,gap:2},reviewGroupTitle:{fontSize:14,fontWeight:"800",marginBottom:2},reviewRow:{minHeight:50,flexDirection:"row",alignItems:"center",gap:8},reviewLabel:{fontSize:12,fontWeight:"700"},reviewValue:{fontSize:14,fontWeight:"700",marginTop:2},edit:{minWidth:52,minHeight:44,alignItems:"center",justifyContent:"center"},
  error:{padding:10,borderRadius:10,fontSize:13,lineHeight:18,marginTop:5},action:{minHeight:52,borderRadius:14,justifyContent:"center",alignItems:"center",marginTop:8,flexDirection:"row",gap:8},actionText:{fontSize:16,fontWeight:"800"},disabled:{opacity:.6},
  artWrap:{alignItems:"center"},initial:{position:"absolute",top:"12%",right:"20%",width:36,height:36,borderRadius:18,alignItems:"center",justifyContent:"center"},initialText:{fontSize:19,fontWeight:"900"},avatarOverlay:{position:"absolute",alignSelf:"center",bottom:"8%"},avatarHeroFrame:{height:176,width:"100%",alignItems:"center",justifyContent:"center"},avatarHeroContent:{width:"100%",alignItems:"center",justifyContent:"center"},reminderArt:{flexDirection:"row",alignItems:"center",gap:2},reviewArt:{alignItems:"center",paddingVertical:4},
  handoff:{flex:1,justifyContent:"center",alignItems:"center",paddingHorizontal:ui.spacing.xl},handoffInner:{width:"100%",maxWidth:420,alignItems:"center"},handoffImage:{width:280,height:245},handoffTitle:{marginTop:12,fontSize:25,fontWeight:"800",textAlign:"center"},handoffSupport:{marginTop:5,fontSize:14,lineHeight:20,textAlign:"center"},handoffLoader:{marginTop:18},handoffReady:{width:30,height:30,borderRadius:15,alignItems:"center",justifyContent:"center",marginTop:18}
});

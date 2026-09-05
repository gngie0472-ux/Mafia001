import React, {useState} from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CreateRoom(){
  const [players,setPlayers]=useState('8');
  return <SafeAreaView style={s.safe}>
    <View style={s.container}>
      <Pressable onPress={()=>router.back()} style={s.back}><Ionicons name="arrow-back" size={22} color="#EEE"/><Text style={s.backText}>Back</Text></Pressable>
      <Text style={s.kicker}>HOST A GAME</Text><Text style={s.title}>Create Room</Text>
      <Text style={s.sub}>Set the rules, invite your crew, and let the night begin.</Text>
      <Text style={s.label}>ROOM NAME</Text>
      <TextInput placeholder="Friday Night" placeholderTextColor="#666872" style={s.input}/>
      <Text style={s.label}>PLAYERS</Text>
      <View style={s.row}>{['6','8','10','12'].map(n=><Pressable key={n} onPress={()=>setPlayers(n)} style={[s.choice,players===n&&s.choiceOn]}><Text style={[s.choiceText,players===n&&s.choiceTextOn]}>{n}</Text></Pressable>)}</View>
      <Text style={s.label}>MODE</Text>
      <View style={s.mode}><Ionicons name="moon" size={22} color="#D7A94B"/><View style={{flex:1}}><Text style={s.modeTitle}>Classic Mafia</Text><Text style={s.modeSub}>Night & day • hidden roles • voting</Text></View><Ionicons name="checkmark-circle" size={22} color="#D7A94B"/></View>
      <Pressable style={s.button}><Text style={s.buttonText}>CREATE ROOM</Text><Ionicons name="arrow-forward" size={19} color="#090A0D"/></Pressable>
    </View>
  </SafeAreaView>
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#090A0D'},container:{padding:20},back:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:34},backText:{color:'#AAA',fontSize:13},kicker:{fontSize:10,letterSpacing:2,color:'#B5222E',fontWeight:'900'},title:{fontSize:34,color:'#F4F1EF',fontWeight:'900',marginTop:5},sub:{color:'#898A92',lineHeight:20,marginTop:7,marginBottom:28},label:{fontSize:10,letterSpacing:1.5,color:'#777983',fontWeight:'900',marginTop:14,marginBottom:9},input:{height:52,borderRadius:13,borderWidth:1,borderColor:'#292B32',backgroundColor:'#14151A',paddingHorizontal:15,color:'#EEE'},row:{flexDirection:'row',gap:9},choice:{flex:1,height:48,borderRadius:12,borderWidth:1,borderColor:'#292B32',backgroundColor:'#14151A',alignItems:'center',justifyContent:'center'},choiceOn:{borderColor:'#D7A94B',backgroundColor:'#2A2110'},choiceText:{color:'#888993',fontWeight:'800'},choiceTextOn:{color:'#D7A94B'},mode:{flexDirection:'row',alignItems:'center',gap:13,padding:15,borderRadius:14,borderWidth:1,borderColor:'#292B32',backgroundColor:'#14151A'},modeTitle:{color:'#EEE',fontWeight:'800'},modeSub:{color:'#777983',fontSize:10,marginTop:3},button:{marginTop:34,height:54,borderRadius:14,backgroundColor:'#D7A94B',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10},buttonText:{fontWeight:'900',letterSpacing:1,color:'#090A0D'}});
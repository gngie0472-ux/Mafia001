import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

const GOLD = '#D7A94B';
const RED = '#B5222E';
const BG = '#090A0D';
const CARD = '#14151A';
const MUTED = '#858792';

function ActionCard({ icon, title, subtitle, onPress, accent = GOLD }: any) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}>
      <View style={[styles.iconBox, { borderColor: accent + '55', backgroundColor: accent + '12' }]}>
        <MaterialCommunityIcons name={icon} size={28} color={accent} />
      </View>
      <View style={styles.actionText}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#62646D" />
    </Pressable>
  );
}

function BottomNav() {
  return (
    <View style={styles.bottomNav}>
      <Pressable style={styles.navItem}>
        <Ionicons name="home" size={22} color={GOLD} />
        <Text style={[styles.navText, { color: GOLD }]}>Home</Text>
      </Pressable>
      <Pressable style={styles.navItem} onPress={() => router.push('/rooms')}>
        <Ionicons name="people-outline" size={22} color={MUTED} />
        <Text style={styles.navText}>Rooms</Text>
      </Pressable>
      <Pressable style={styles.playButton} onPress={() => router.push('/create-room')}>
        <Ionicons name="add" size={30} color="#0B0B0D" />
      </Pressable>
      <Pressable style={styles.navItem} onPress={() => router.push('/ranking')}>
        <Ionicons name="trophy-outline" size={22} color={MUTED} />
        <Text style={styles.navText}>Ranking</Text>
      </Pressable>
      <Pressable style={styles.navItem} onPress={() => router.push('/profile')}>
        <Ionicons name="person-outline" size={22} color={MUTED} />
        <Text style={styles.navText}>Profile</Text>
      </Pressable>
    </View>
  );
}

export default function Home() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>WELCOME BACK</Text>
            <Text style={styles.logo}>MAFIA <Text style={styles.logoGold}>NIGHT</Text></Text>
          </View>
          <Pressable style={styles.coinPill} onPress={() => router.push('/vip')}>
            <Ionicons name="diamond" size={16} color={GOLD} />
            <Text style={styles.coinText}>VIP</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <Text style={styles.heroEyebrow}>THE CITY NEVER SLEEPS</Text>
          <Text style={styles.heroTitle}>Trust no one.</Text>
          <Text style={styles.heroBody}>Read the room. Build your crew. Find the Mafia before sunrise.</Text>
          <Pressable style={styles.primary} onPress={() => router.push('/create-room')}>
            <Text style={styles.primaryText}>PLAY NOW</Text>
            <Ionicons name="arrow-forward" size={19} color="#0B0B0D" />
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>GAME NIGHT</Text>
          <Text style={styles.sectionHint}>Choose your move</Text>
        </View>

        <ActionCard icon="account-group" title="Create Room" subtitle="Start a private game with friends" onPress={() => router.push('/create-room')} />
        <ActionCard icon="door-open" title="Join Room" subtitle="Enter a room with a code" accent={RED} onPress={() => router.push('/join-room')} />

        <View style={styles.mission}>
          <View style={styles.missionIcon}><Ionicons name="flame" size={24} color={RED} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.missionLabel}>DAILY MISSION</Text>
            <Text style={styles.missionTitle}>Win 2 games tonight</Text>
            <View style={styles.progressTrack}><View style={styles.progressFill} /></View>
            <Text style={styles.progressText}>1 / 2 completed</Text>
          </View>
          <Text style={styles.reward}>+250</Text>
        </View>

        <View style={styles.quickRow}>
          <Pressable style={styles.quickCard} onPress={() => router.push('/ranking')}>
            <Ionicons name="trophy" size={24} color={GOLD} />
            <Text style={styles.quickTitle}>Ranking</Text>
            <Text style={styles.quickSub}>Top players</Text>
          </Pressable>
          <Pressable style={styles.quickCard} onPress={() => router.push('/vip')}>
            <Ionicons name="diamond" size={24} color={GOLD} />
            <Text style={styles.quickTitle}>VIP Club</Text>
            <Text style={styles.quickSub}>Unlock perks</Text>
          </Pressable>
        </View>
      </ScrollView>
      <BottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:BG},
  container:{paddingHorizontal:18,paddingBottom:110},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingTop:8,paddingBottom:22},
  kicker:{fontSize:10,letterSpacing:3,color:MUTED,fontWeight:'700'},
  logo:{fontSize:25,fontWeight:'900',letterSpacing:2,color:'#F2F2F4'},
  logoGold:{color:GOLD},
  coinPill:{flexDirection:'row',gap:7,alignItems:'center',paddingHorizontal:13,paddingVertical:9,borderRadius:20,borderWidth:1,borderColor:'#3A3325',backgroundColor:'#17140D'},
  coinText:{color:GOLD,fontWeight:'800',fontSize:12},
  hero:{overflow:'hidden',minHeight:225,borderRadius:22,padding:24,justifyContent:'center',borderWidth:1,borderColor:'#28242A',backgroundColor:'#171318',marginBottom:25},
  heroGlow:{position:'absolute',right:-70,top:-80,width:230,height:230,borderRadius:150,backgroundColor:'#7D1825',opacity:.22},
  heroEyebrow:{fontSize:10,letterSpacing:2.2,color:RED,fontWeight:'900',marginBottom:8},
  heroTitle:{fontSize:35,fontWeight:'900',color:'#F7F2EE',letterSpacing:-1},
  heroBody:{fontSize:14,lineHeight:20,color:'#A7A4AA',maxWidth:280,marginTop:5,marginBottom:18},
  primary:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:10,backgroundColor:GOLD,paddingHorizontal:18,paddingVertical:12,borderRadius:12},
  primaryText:{fontWeight:'900',fontSize:12,letterSpacing:1.2,color:'#0B0B0D'},
  sectionHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'baseline',marginBottom:12},
  sectionTitle:{fontSize:13,letterSpacing:1.6,color:'#E9E6E0',fontWeight:'900'},
  sectionHint:{fontSize:11,color:MUTED},
  actionCard:{flexDirection:'row',alignItems:'center',padding:14,borderRadius:16,borderWidth:1,borderColor:'#24262D',backgroundColor:CARD,marginBottom:10},
  pressed:{opacity:.72,transform:[{scale:.99}]},
  iconBox:{width:50,height:50,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},
  actionText:{flex:1,marginLeft:13},
  actionTitle:{fontSize:15,fontWeight:'800',color:'#F0F0F2'},
  actionSubtitle:{fontSize:11,color:MUTED,marginTop:4},
  mission:{flexDirection:'row',alignItems:'center',gap:13,padding:16,marginTop:8,marginBottom:14,borderRadius:17,backgroundColor:'#151216',borderWidth:1,borderColor:'#2B2025'},
  missionIcon:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#35161D'},
  missionLabel:{fontSize:9,letterSpacing:1.4,color:RED,fontWeight:'900'},
  missionTitle:{fontSize:13,color:'#E8E5E7',fontWeight:'700',marginTop:3,marginBottom:8},
  progressTrack:{height:5,borderRadius:4,backgroundColor:'#2B2C31',overflow:'hidden'},
  progressFill:{height:5,width:'50%',backgroundColor:RED,borderRadius:4},
  progressText:{fontSize:9,color:MUTED,marginTop:4},
  reward:{fontSize:11,color:GOLD,fontWeight:'900'},
  quickRow:{flexDirection:'row',gap:10},
  quickCard:{flex:1,padding:17,borderRadius:17,backgroundColor:CARD,borderWidth:1,borderColor:'#24262D'},
  quickTitle:{fontSize:14,fontWeight:'800',color:'#EDEDEF',marginTop:10},
  quickSub:{fontSize:10,color:MUTED,marginTop:3},
  bottomNav:{position:'absolute',left:0,right:0,bottom:0,height:82,paddingHorizontal:17,paddingTop:10,paddingBottom:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#0C0D10EE',borderTopWidth:1,borderTopColor:'#23242A'},
  navItem:{width:58,alignItems:'center',gap:4},
  navText:{fontSize:9,color:MUTED,fontWeight:'700'},
  playButton:{width:54,height:54,borderRadius:18,backgroundColor:GOLD,alignItems:'center',justifyContent:'center',marginTop:-27,borderWidth:4,borderColor:BG}
});
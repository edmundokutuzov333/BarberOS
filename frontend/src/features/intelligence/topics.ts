import { Layers, CalendarDays, Coins, Users, UsersRound, Package, MessageCircle, Megaphone, Settings, type LucideIcon } from 'lucide-react';
import { topics, labels, type Topic } from './api';

// All management topics in the API are represented exactly once in BOTH controls.
// Position is presentation only; topic identity, label and icon are shared.
const visual:Record<Topic,{icon:LucideIcon;x:number;y:number}>={
 overview:{icon:Layers,x:50,y:8},
 agenda:{icon:CalendarDays,x:17,y:26},
 finance:{icon:Coins,x:83,y:26},
 customers:{icon:Users,x:17,y:50},
 team:{icon:UsersRound,x:83,y:50},
 stock:{icon:Package,x:17,y:74},
 communications:{icon:MessageCircle,x:83,y:74},
 marketing:{icon:Megaphone,x:30,y:92},
 setup:{icon:Settings,x:70,y:92},
};
export const managementTopics=topics.map(topic=>({topic,label:labels[topic],...visual[topic]}));
export const topicIcon=(topic:Topic)=>visual[topic].icon;

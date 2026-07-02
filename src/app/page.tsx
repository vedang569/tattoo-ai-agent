'use client';
import { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function StudioInbox() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversations();
    const channel = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => fetchConversations())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          if (selectedConvo && payload.new.conversation_id === selectedConvo.id) {
            setMessages(prev => [...prev, payload.new]);
          }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedConvo]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function fetchConversations() {
    const { data } = await supabase.from('conversations').select('*').order('updated_at', { ascending: false });
    setConversations(data || []);
    setLoading(false);
  }

  async function selectConversation(convo: any) {
    setSelectedConvo(convo);
    const { data } = await supabase.from('messages').select('*').eq('conversation_id', convo.id).order('created_at', { ascending: true });
    setMessages(data || []);
  }

  async function toggleMode() {
    if (!selectedConvo) return;
    const newMode = selectedConvo.mode === 'ai' ? 'human' : 'ai';
    const { data } = await supabase.from('conversations').update({ mode: newMode }).eq('id', selectedConvo.id).select().single();
    setSelectedConvo(data);
    fetchConversations();
  }

  async function handleSend() {
    if (!newMessage.trim() || !selectedConvo) return;
    const content = newMessage; setNewMessage('');
    await fetch(`/api/conversations/${selectedConvo.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900">
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-sm">
        <div className="p-6 border-b border-gray-100 bg-gray-900 text-white"><h1 className="text-xl font-bold tracking-tight">Studio Leads</h1><p className="text-xs text-gray-400 mt-1">Real-time Lead Management</p></div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map(convo => (
            <div key={convo.id} onClick={() => selectConversation(convo)} className={`p-4 border-b border-gray-50 cursor-pointer transition ${selectedConvo?.id === convo.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'hover:bg-gray-50'}`}>
              <div className="flex justify-between items-start mb-1"><span className="font-bold text-sm truncate">{convo.name || convo.phone}</span><span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${convo.mode === 'ai' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{convo.mode}</span></div>
              <div className="flex justify-between items-center text-xs text-gray-500"><span>{convo.phone}</span><span className="capitalize text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{convo.status.replace('_', ' ')}</span></div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        {selectedConvo ? (
          <>
            <div className="px-6 py-4 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm">
              <div className="flex items-center gap-4"><div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-600">{selectedConvo.name?.charAt(0) || '#'}</div><div><h2 className="text-lg font-black">{selectedConvo.name || selectedConvo.phone}</h2><p className="text-xs text-blue-600 font-bold uppercase tracking-wider">{selectedConvo.status.replace('_', ' ')}</p></div></div>
              <button onClick={toggleMode} className={`px-5 py-2 rounded-full font-black text-xs uppercase tracking-widest transition-all transform hover:scale-105 active:scale-95 ${selectedConvo.mode === 'ai' ? 'bg-red-600 text-white shadow-lg shadow-red-200' : 'bg-green-600 text-white shadow-lg shadow-green-200'}`}>{selectedConvo.mode === 'ai' ? 'Pause AI' : 'Resume AI'}</button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-[#f8f9fc]">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[65%] p-4 rounded-3xl shadow-sm ${m.role === 'user' ? 'bg-white text-gray-800 rounded-tl-none border border-gray-100' : 'bg-gray-900 text-white rounded-tr-none'}`}><p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p><div className="mt-2 flex justify-end"><span className="text-[9px] opacity-40 font-bold uppercase">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div></div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="p-6 bg-white border-t border-gray-200 shadow-2xl">
              <div className="flex gap-4 items-center">
                <input value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder={selectedConvo.mode === 'ai' ? "AI is running..." : "Type your message..."} disabled={selectedConvo.mode === 'ai'} className="flex-1 border-2 border-gray-100 rounded-2xl px-6 py-4 font-medium" />
                <button onClick={handleSend} disabled={selectedConvo.mode === 'ai' || !newMessage.trim()} className="bg-blue-600 text-white h-14 w-14 rounded-2xl flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg></button>
              </div>
            </div>
          </>
        ) : <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-4"><p className="text-sm font-black uppercase tracking-widest">Select a Lead to start</p></div>}
      </div>
    </div>
  );
}
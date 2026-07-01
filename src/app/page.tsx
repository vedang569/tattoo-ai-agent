'use client';
import { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function SharedInbox() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversations();
    const channel = supabase.channel('realtime-inbox')
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
    <div className="flex h-screen bg-gray-100 font-sans">
      <div className="w-80 bg-white border-r flex flex-col">
        <div className="p-4 border-b bg-gray-900 text-white"><h1 className="text-xl font-bold">Studio Inbox</h1></div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map(convo => (
            <div key={convo.id} onClick={() => selectConversation(convo)} className={`p-4 border-b cursor-pointer transition ${selectedConvo?.id === convo.id ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'}`}>
              <div className="flex justify-between items-start">
                <span className="font-semibold text-gray-800">{convo.name || convo.phone}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${convo.mode === 'ai' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{convo.mode}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1 truncate">{convo.phone}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        {selectedConvo ? (
          <>
            <div className="p-4 bg-white border-b flex justify-between items-center shadow-sm">
              <div><h2 className="text-lg font-bold">{selectedConvo.name || selectedConvo.phone}</h2><p className="text-xs text-gray-400">Status: {selectedConvo.status}</p></div>
              <button onClick={toggleMode} className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${selectedConvo.mode === 'ai' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                {selectedConvo.mode === 'ai' ? 'Pause AI & Take Over' : 'Resume AI Bot'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[70%] p-3 rounded-2xl shadow-sm ${m.role === 'user' ? 'bg-white text-gray-800 rounded-tl-none border' : 'bg-gray-900 text-white rounded-tr-none'}`}>
                    <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                    <span className="text-[10px] opacity-50 mt-1 block text-right">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="p-4 bg-white border-t flex gap-3">
              <input value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder={selectedConvo.mode === 'ai' ? "AI is handling this..." : "Type a manual reply..."} disabled={selectedConvo.mode === 'ai'} className="flex-1 border rounded-xl px-4 py-2 disabled:bg-gray-100" />
              <button onClick={handleSend} disabled={selectedConvo.mode === 'ai' || !newMessage.trim()} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50">Send</button>
            </div>
          </>
        ) : <div className="flex-1 flex items-center justify-center text-gray-400 italic">Select a lead to start chatting.</div>}
      </div>
    </div>
  );
}
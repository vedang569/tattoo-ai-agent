'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminDashboard() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchConversations();
    const channel = supabase.channel('schema-db-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => { fetchConversations(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);
  async function fetchConversations() {
    const { data } = await supabase.from('conversations').select('*').order('updated_at', { ascending: false });
    setConversations(data || []);
    setLoading(false);
  }
  async function toggleMode(id: string, currentMode: string) {
    const newMode = currentMode === 'ai' ? 'human' : 'ai';
    await supabase.from('conversations').update({ mode: newMode }).eq('id', id);
    fetchConversations();
  }
  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">Tattoo Studio AI Agent Dashboard</h1>
      {loading ? <p>Loading conversations...</p> : (
        <div className="grid gap-6">
          {conversations.map((convo) => (
            <div key={convo.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">{convo.name || 'Unknown Client'}</h2>
                <p className="text-gray-500">{convo.phone}</p>
                <p className="text-sm text-gray-400 mt-2">Status: {convo.status}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${convo.mode === 'ai' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {convo.mode} Mode
                </span>
                <button onClick={() => toggleMode(convo.id, convo.mode)} className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition">Switch to {convo.mode === 'ai' ? 'Human' : 'AI'}</button>
              </div>
            </div>
          ))}
          {conversations.length === 0 && <p className="text-gray-500 italic">No conversations yet.</p>}
        </div>
      )}
    </div>
  );
}
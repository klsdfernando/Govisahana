// Main GoviSahana Application Root with Authentication, Single-Expert Locking & Real-Time Sync
import { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';
import SignupPage from './components/SignupPage';
import FarmerDashboard from './components/FarmerDashboard';
import NewTicketModal from './components/NewTicketModal';
import ConsultationRoom from './components/ConsultationRoom';
import ExpertDashboard from './components/ExpertDashboard';

import { INITIAL_CONSULTATIONS, INITIAL_MESSAGES } from './data/mockData';

const API_BASE = '';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeView, setActiveView] = useState('landing');
  const [currentLanguage, setCurrentLanguage] = useState('en');

  const [consultations, setConsultations] = useState(INITIAL_CONSULTATIONS);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [activeConsultationId, setActiveConsultationId] = useState('con_101');
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);

  // Sync consultations from backend
  const refreshConsultations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/consultations`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setConsultations(data);
        }
      }
    } catch (err) {
      console.warn('API sync warning:', err.message);
    }
  }, []);

  useEffect(() => {
    refreshConsultations();
    const interval = setInterval(refreshConsultations, 3000);
    return () => clearInterval(interval);
  }, [refreshConsultations]);

  // Handle Authentication Success (Login or Signup)
  const handleAuthSuccess = (userObj) => {
    setCurrentUser(userObj);
    if (userObj.role === 'farmer') {
      setActiveView('farmer_dashboard');
    } else {
      setActiveView('expert_dashboard');
    }
    refreshConsultations();
  };

  // Handle Logout
  const handleLogout = () => {
    setCurrentUser(null);
    setActiveView('landing');
  };

  // Claim Ticket by Expert
  const handleClaimTicket = async (ticketId) => {
    try {
      const res = await fetch(`${API_BASE}/api/consultations/${ticketId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expertId: currentUser?.id || 'exp_1',
          expertName: currentUser?.name || 'Dr. Nimal Jayasinghe',
          expertEmail: currentUser?.email || 'nimal@govisahana.lk'
        })
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to claim consultation');
        return false;
      }
      await refreshConsultations();
      return true;
    } catch (err) {
      console.error('Claim error:', err);
      return false;
    }
  };

  // Release Ticket by Expert
  const handleReleaseTicket = async (ticketId) => {
    try {
      const res = await fetch(`${API_BASE}/api/consultations/${ticketId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expertEmail: currentUser?.email
        })
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to release consultation');
        return false;
      }
      await refreshConsultations();
      return true;
    } catch (err) {
      console.error('Release error:', err);
      return false;
    }
  };

  // Issue Official Prescription / Remedy
  const handleIssuePrescription = async (ticketId, rx) => {
    try {
      const res = await fetch(`${API_BASE}/api/consultations/${ticketId}/prescription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prescription: rx,
          expertEmail: currentUser?.email
        })
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to issue prescription');
        return false;
      }
      await refreshConsultations();
      return true;
    } catch (err) {
      console.error('Prescription error:', err);
      return false;
    }
  };

  // Create New Consultation Ticket by Farmer
  const handleCreateTicket = async (newTicketData) => {
    try {
      const payload = {
        title: newTicketData.title,
        cropType: newTicketData.cropType || 'paddy',
        cropLabel: newTicketData.cropLabel || 'Paddy / Rice',
        description: newTicketData.description,
        farmerName: currentUser?.name || newTicketData.farmerName || 'Sunil Rathnayake',
        farmerEmail: currentUser?.email || 'sunil@farmer.lk',
        farmerPhone: currentUser?.phone || newTicketData.farmerPhone || '+94 77 555 1212',
        farmerDistrict: currentUser?.district || newTicketData.farmerDistrict || 'Anuradhapura',
        sampleImage: newTicketData.sampleImage || 'https://images.unsplash.com/photo-1592417817098-8f3d6eb19657?auto=format&fit=crop&w=800&q=80'
      };

      const res = await fetch(`${API_BASE}/api/consultations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const created = await res.json();
        await refreshConsultations();
        setActiveConsultationId(created._id || created.id);
        setActiveView('consultation_room');
      } else {
        // Fallback local append
        const id = `con_${Date.now()}`;
        const local = { ...newTicketData, id, _id: id, status: 'Pending' };
        setConsultations(prev => [local, ...prev]);
        setActiveConsultationId(id);
        setActiveView('consultation_room');
      }
    } catch (err) {
      console.error('Create ticket error:', err);
    }
  };

  // Send Message in Consultation Room
  const handleSendMessage = async (consultationId, msgPayload) => {
    try {
      const res = await fetch(`${API_BASE}/api/consultations/${consultationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msgPayload)
      });

      if (res.status === 403) {
        alert('Chat Input Locked: This consultation is exclusively assigned to another agronomist.');
        return null;
      }

      if (res.ok) {
        const savedMsg = await res.json();
        refreshConsultations();
        return savedMsg;
      }
    } catch (err) {
      console.error('Send message error:', err);
    }
    return null;
  };

  const activeConsultation = consultations.find(c => (c._id || c.id) === activeConsultationId) || consultations[0];
  const activeChatMessages = messages[activeConsultationId] || [];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 antialiased selection:bg-emerald-200 selection:text-emerald-900">
      
      {/* Top Navbar */}
      <Navbar
        activeView={activeView}
        setActiveView={setActiveView}
        currentLanguage={currentLanguage}
        setCurrentLanguage={setCurrentLanguage}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main View Router with Auth Guards */}
      <main className="flex-1">
        {activeView === 'landing' && (
          <LandingPage setActiveView={setActiveView} />
        )}

        {activeView === 'login' && (
          <LoginPage setActiveView={setActiveView} onLoginSuccess={handleAuthSuccess} />
        )}

        {activeView === 'signup' && (
          <SignupPage setActiveView={setActiveView} onSignupSuccess={handleAuthSuccess} />
        )}

        {/* Protected Farmer Dashboard */}
        {activeView === 'farmer_dashboard' && (
          currentUser ? (
            <FarmerDashboard
              currentUser={currentUser}
              consultations={consultations}
              onOpenNewTicketModal={() => setIsTicketModalOpen(true)}
              onSelectConsultation={(id) => setActiveConsultationId(id)}
              setActiveView={setActiveView}
            />
          ) : (
            <LoginPage setActiveView={setActiveView} onLoginSuccess={handleAuthSuccess} />
          )
        )}

        {/* Protected Consultation Room */}
        {activeView === 'consultation_room' && (
          currentUser ? (
            <ConsultationRoom
              currentUser={currentUser}
              consultation={activeConsultation}
              messages={activeChatMessages}
              onSendMessage={handleSendMessage}
              onClaimTicket={handleClaimTicket}
              onReleaseTicket={handleReleaseTicket}
              onIssuePrescription={handleIssuePrescription}
              onBackToDashboard={() => setActiveView(currentUser.role === 'farmer' ? 'farmer_dashboard' : 'expert_dashboard')}
            />
          ) : (
            <LoginPage setActiveView={setActiveView} onLoginSuccess={handleAuthSuccess} />
          )
        )}

        {/* Protected Expert Desk */}
        {activeView === 'expert_dashboard' && (
          currentUser ? (
            <ExpertDashboard
              currentUser={currentUser}
              consultations={consultations}
              onSelectConsultation={(id) => setActiveConsultationId(id)}
              onClaimTicket={handleClaimTicket}
              onReleaseTicket={handleReleaseTicket}
              setActiveView={setActiveView}
            />
          ) : (
            <LoginPage setActiveView={setActiveView} onLoginSuccess={handleAuthSuccess} />
          )
        )}
      </main>

      {/* New Consultation Ticket Modal */}
      <NewTicketModal
        isOpen={isTicketModalOpen}
        onClose={() => setIsTicketModalOpen(false)}
        onSubmitTicket={handleCreateTicket}
        currentUser={currentUser}
      />

    </div>
  );
}

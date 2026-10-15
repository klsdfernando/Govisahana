const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

// Load environment variables from server/.env or root .env
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/govisahana';

// Root directory for static frontend files
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(ROOT_DIR));

const { Resend } = require('resend');
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// --- EMAIL TRANSPORTER (Gmail SMTP fallback) ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS // Gmail App Password
  }
});

// --- MONGOOSE MODELS ---

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, default: '' },
  name: { type: String, required: true },
  role: { type: String, enum: ['farmer', 'expert'], required: true },
  district: { type: String, default: 'Anuradhapura' },
  cropOrDept: { type: String, default: '' },
  designation: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

// OTP Schema
const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true }
});
const OTP = mongoose.models.OTP || mongoose.model('OTP', otpSchema);

// Consultation Ticket Schema (With Dedicated Expert Claim & Access Tracking)
const consultationSchema = new mongoose.Schema({
  ticketId: { type: String, required: true, unique: true },
  farmerEmail: { type: String, default: '', lowercase: true, trim: true },
  farmerPhone: { type: String, default: '' },
  farmerName: { type: String, required: true },
  farmerDistrict: { type: String, required: true },
  title: { type: String, required: true },
  cropType: { type: String, required: true },
  cropLabel: { type: String, required: true },
  description: { type: String, required: true },
  sampleImage: { type: String, default: 'https://images.unsplash.com/photo-1586771107445-d3ca888129ff?auto=format&fit=crop&w=800&q=80' },
  status: { type: String, enum: ['Pending', 'In Progress', 'Resolved'], default: 'Pending' },
  // Single Expert Claim Assignment:
  assignedExpertId: { type: String, default: null },
  assignedExpertName: { type: String, default: null },
  assignedExpertEmail: { type: String, default: null, lowercase: true, trim: true },
  claimedAt: { type: Date, default: null },
  prescription: {
    title: String,
    diagnosis: String,
    treatment: String,
    dosage: String,
    timing: String,
    expertName: String,
    date: String,
    issuedAt: Date
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const Consultation = mongoose.models.Consultation || mongoose.model('Consultation', consultationSchema);

// Chat Message Schema
const messageSchema = new mongoose.Schema({
  consultationId: { type: String, required: true, index: true },
  senderName: { type: String, required: true },
  senderRole: { type: String, enum: ['farmer', 'expert', 'system'], required: true },
  senderEmail: { type: String, default: '', lowercase: true, trim: true },
  text: { type: String, default: '' },
  image: { type: String, default: null },
  prescription: { type: Object, default: null },
  timestamp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

// --- PERSISTENT FILE-BACKED IN-MEMORY STORE (When MongoDB is not running locally) ---
let isDbConnected = false;
let cachedDb = null;
const memUsers = new Map();
const memOtps = new Map();

// Initial seed data if no store file exists
const SEED_CONSULTATIONS = [
  {
    _id: 'con_101',
    id: 'con_101',
    ticketId: 'GS-2026-089',
    farmerEmail: 'sunil@farmer.lk',
    farmerName: 'Sunil Rathnayake',
    farmerDistrict: 'Anuradhapura',
    farmerPhone: '+94 77 555 1212',
    title: 'Yellowing leaves & brown spots in Maha season paddy crop',
    cropType: 'paddy',
    cropLabel: 'Paddy / Rice',
    description: 'Leaves on my 3-acre paddy field near Kekirawa are turning yellowish brown with elongated dark spots after heavy evening rain.',
    status: 'In Progress',
    assignedExpertId: 'exp_1',
    assignedExpertName: 'Dr. Nimal Jayasinghe',
    assignedExpertEmail: 'nimal@govisahana.lk',
    claimedAt: new Date(Date.now() - 3600000).toISOString(),
    sampleImage: 'https://images.unsplash.com/photo-1586771107445-d3ca888129ff?auto=format&fit=crop&w=800&q=80',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    _id: 'con_102',
    id: 'con_102',
    ticketId: 'GS-2026-074',
    farmerEmail: 'sunil@farmer.lk',
    farmerName: 'Sunil Rathnayake',
    farmerDistrict: 'Anuradhapura',
    farmerPhone: '+94 77 555 1212',
    title: 'Whitefly infestation on Green Chili plants',
    cropType: 'vegetables',
    cropLabel: 'Low-Country Vegetables',
    description: 'Tiny white flies underneath the chili leaves causing leaf curl and stunted growth. Looking for immediate guidance.',
    status: 'Pending',
    assignedExpertId: null,
    assignedExpertName: null,
    assignedExpertEmail: null,
    claimedAt: null,
    sampleImage: 'https://images.unsplash.com/photo-1592417817098-8f3d6eb19657?auto=format&fit=crop&w=800&q=80',
    createdAt: new Date(Date.now() - 14400000).toISOString(),
    updatedAt: new Date(Date.now() - 14400000).toISOString()
  },
  {
    _id: 'con_103',
    id: 'con_103',
    ticketId: 'GS-2026-092',
    farmerEmail: 'kamal@farmer.lk',
    farmerName: 'Kamal Perera',
    farmerDistrict: 'Kurunegala',
    farmerPhone: '+94 71 444 8899',
    title: 'Leaf curling & caterpillar damage on young coconut palms',
    cropType: 'coconut',
    cropLabel: 'Coconut',
    description: 'Lower leaves of 2-year old coconut palms showing scorched appearance and dried webbing from caterpillars.',
    status: 'In Progress',
    assignedExpertId: 'exp_2',
    assignedExpertName: 'Mrs. Priyanthi Bandara',
    assignedExpertEmail: 'priyanthi@govisahana.lk',
    claimedAt: new Date(Date.now() - 1800000).toISOString(),
    sampleImage: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=800&q=80',
    createdAt: new Date(Date.now() - 28800000).toISOString(),
    updatedAt: new Date(Date.now() - 1800000).toISOString()
  }
];

const SEED_MESSAGES = {
  'con_101': [
    {
      _id: 'msg_1',
      id: 'msg_1',
      consultationId: 'con_101',
      senderName: 'Sunil Rathnayake',
      senderRole: 'farmer',
      senderEmail: 'sunil@farmer.lk',
      text: 'Ayubowan Doctor! Leaves on my paddy crop are showing severe yellowing after recent heavy rains.',
      image: 'https://images.unsplash.com/photo-1586771107445-d3ca888129ff?auto=format&fit=crop&w=800&q=80',
      timestamp: '08:00 AM',
      createdAt: new Date(Date.now() - 7200000).toISOString()
    },
    {
      _id: 'msg_sys_1',
      id: 'msg_sys_1',
      consultationId: 'con_101',
      senderName: 'GoviSahana Desk',
      senderRole: 'system',
      senderEmail: 'system@govisahana.lk',
      text: '👨‍🌾 Dr. Nimal Jayasinghe (Extension Desk) has accepted this case. Chat room is now active.',
      timestamp: '08:05 AM',
      createdAt: new Date(Date.now() - 3600000).toISOString()
    },
    {
      _id: 'msg_2',
      id: 'msg_2',
      consultationId: 'con_101',
      senderName: 'Dr. Nimal Jayasinghe',
      senderRole: 'expert',
      senderEmail: 'nimal@govisahana.lk',
      text: 'Hello Mr. Sunil! I have reviewed your photos. The spindle-shaped lesions indicate early Paddy Blast. Please check the remedy card below.',
      image: null,
      timestamp: '08:10 AM',
      createdAt: new Date(Date.now() - 3300000).toISOString()
    }
  ],
  'con_102': [
    {
      _id: 'msg_init_102',
      id: 'msg_init_102',
      consultationId: 'con_102',
      senderName: 'Sunil Rathnayake',
      senderRole: 'farmer',
      senderEmail: 'sunil@farmer.lk',
      text: 'Consultation Ticket Created: Tiny white flies underneath the chili leaves causing leaf curl and stunted growth. Looking for immediate guidance.',
      image: 'https://images.unsplash.com/photo-1592417817098-8f3d6eb19657?auto=format&fit=crop&w=800&q=80',
      timestamp: '09:00 AM',
      createdAt: new Date(Date.now() - 14400000).toISOString()
    }
  ],
  'con_103': [
    {
      _id: 'msg_init_103',
      id: 'msg_init_103',
      consultationId: 'con_103',
      senderName: 'Kamal Perera',
      senderRole: 'farmer',
      senderEmail: 'kamal@farmer.lk',
      text: 'Consultation Ticket Created: Lower leaves of 2-year old coconut palms showing scorched appearance and dried webbing from caterpillars.',
      image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=800&q=80',
      timestamp: '06:30 AM',
      createdAt: new Date(Date.now() - 28800000).toISOString()
    },
    {
      _id: 'msg_sys_103',
      id: 'msg_sys_103',
      consultationId: 'con_103',
      senderName: 'GoviSahana Desk',
      senderRole: 'system',
      senderEmail: 'system@govisahana.lk',
      text: '👨‍🌾 Mrs. Priyanthi Bandara has accepted this case. Chat room is now active.',
      timestamp: '07:00 AM',
      createdAt: new Date(Date.now() - 1800000).toISOString()
    }
  ]
};

let memConsultations = [...SEED_CONSULTATIONS];
let memMessages = { ...SEED_MESSAGES };

// Load and save local store
function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.consultations) && data.consultations.length > 0) {
        memConsultations = data.consultations;
      }
      if (data.messages && typeof data.messages === 'object') {
        memMessages = data.messages;
      }
      if (Array.isArray(data.users)) {
        memUsers.clear();
        data.users.forEach(u => memUsers.set(u.email, u));
      }
      console.log(`📁 Loaded local JSON store: ${memConsultations.length} consultations, ${Object.keys(memMessages).length} chats`);
    } else {
      saveStore();
    }
  } catch (err) {
    console.warn('⚠️ Could not load local JSON store:', err.message);
  }
}

function saveStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const data = {
      consultations: memConsultations,
      messages: memMessages,
      users: Array.from(memUsers.values())
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('⚠️ Could not write local JSON store:', err.message);
  }
}

// Initial load
loadStore();

// Database Connection Manager with Serverless Connection Caching
async function ensureDbConnection() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    isDbConnected = true;
    return cachedDb;
  }
  try {
    cachedDb = await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
    isDbConnected = true;
    console.log(`✅ Connected to MongoDB at: ${MONGODB_URI.replace(/:[^:]*@/, ':****@')}`);
    return cachedDb;
  } catch (err) {
    isDbConnected = false;
    return null;
  }
}

// Middleware: ensure database connection is ready for incoming requests
app.use(async (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    await ensureDbConnection();
  }
  next();
});

// --- HELPER: Send OTP Email ---
async function sendOtpEmail(email, code) {
  const emailHtml = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#f4f9f5;padding:32px;border-radius:16px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#1B5E20;font-size:28px;margin:0;">🌾 GoviSahana</h1>
        <p style="color:#555;font-size:13px;margin-top:6px;">Sri Lanka Agricultural Advisory Platform</p>
      </div>
      <div style="background:#fff;border-radius:12px;padding:24px;text-align:center;border:1px solid #c8e6c9;">
        <p style="color:#333;font-size:14px;margin:0 0 16px;">Your One-Time Verification Code is:</p>
        <div style="background:#1B5E20;color:#fff;font-size:40px;font-weight:900;letter-spacing:10px;padding:16px 24px;border-radius:10px;display:inline-block;font-family:monospace;">
          ${code}
        </div>
        <p style="color:#888;font-size:12px;margin-top:16px;">This code expires in <strong>5 minutes</strong>.</p>
        <p style="color:#888;font-size:12px;">If you did not request this, please ignore this email.</p>
      </div>
      <p style="text-align:center;color:#aaa;font-size:11px;margin-top:20px;">GoviSahana • Cultivating Knowledge Together</p>
    </div>
  `;

  // 1. Try Gmail SMTP first
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      const mailOptions = {
        from: `"GoviSahana 🌾" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your GoviSahana Verification Code',
        html: emailHtml
      };
      const result = await transporter.sendMail(mailOptions);
      console.log(`✉️ OTP email delivered via Gmail SMTP to ${email}`);
      return result;
    } catch (smtpErr) {
      console.warn(`Gmail SMTP failed (${smtpErr.message}), trying Resend fallback...`);
    }
  }

  // 2. Fallback to Resend
  if (resend) {
    try {
      const response = await resend.emails.send({
        from: 'GoviSahana <onboarding@resend.dev>',
        to: email,
        subject: 'Your GoviSahana Verification Code: ' + code,
        html: emailHtml
      });
      if (response && response.error) {
        throw new Error(response.error.message || 'Resend API returned error');
      }
      return response;
    } catch (apiErr) {
      console.warn(`Resend also failed (${apiErr.message}).`);
    }
  }

  throw new Error('No email service configured. Please set EMAIL_USER, EMAIL_PASS, or RESEND_API_KEY.');
}

// --- REST API ENDPOINTS ---

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'GoviSahana Platform API',
    timestamp: new Date().toISOString(),
    dbConnected: mongoose.connection.readyState === 1,
    mode: mongoose.connection.readyState === 1 ? 'mongodb' : 'persistent-json-store'
  });
});

// --- OTP: Send ---
app.post('/api/otp/send', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email address is required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    if (mongoose.connection.readyState === 1) {
      await OTP.deleteMany({ email: cleanEmail });
      await OTP.create({ email: cleanEmail, code, expiresAt });
    } else {
      memOtps.set(cleanEmail, { code, expiresAt });
    }

    console.log(`🔑 [OTP CODE GENERATED for ${cleanEmail}]: ${code}`);

    try {
      await sendOtpEmail(cleanEmail, code);
      res.json({ message: `OTP sent to ${cleanEmail}` });
    } catch (mailErr) {
      res.json({
        message: `OTP generated for ${cleanEmail}. Check server log or use code: ${code}`,
        devCode: code
      });
    }
  } catch (err) {
    console.error('OTP send error:', err.message);
    res.status(500).json({ error: 'Failed to process OTP request.', details: err.message });
  }
});

// --- OTP: Verify ---
app.post('/api/otp/verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: 'Email and OTP code are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (mongoose.connection.readyState === 1) {
      const otpRecord = await OTP.findOne({ email: cleanEmail });
      if (!otpRecord) {
        return res.status(400).json({ error: 'No OTP found for this email. Please request a new one.' });
      }
      if (new Date() > otpRecord.expiresAt) {
        await OTP.deleteMany({ email: cleanEmail });
        return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
      }
      if (otpRecord.code !== code.toString()) {
        return res.status(400).json({ error: 'Incorrect OTP code. Please try again.' });
      }
      await OTP.deleteMany({ email: cleanEmail });
    } else {
      const otpRecord = memOtps.get(cleanEmail);
      if (!otpRecord) {
        return res.status(400).json({ error: 'No OTP found for this email. Please request a new one.' });
      }
      if (new Date() > otpRecord.expiresAt) {
        memOtps.delete(cleanEmail);
        return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
      }
      if (otpRecord.code !== code.toString()) {
        return res.status(400).json({ error: 'Incorrect OTP code. Please try again.' });
      }
      memOtps.delete(cleanEmail);
    }

    res.json({ message: 'OTP verified successfully.', verified: true });
  } catch (err) {
    res.status(500).json({ error: 'OTP verification failed.', details: err.message });
  }
});

// --- Auth: Register ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, role, district, cropOrDept, designation } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({ error: 'Name, email, and role are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (mongoose.connection.readyState === 1) {
      let existingUser = await User.findOne({ email: cleanEmail });
      if (existingUser) {
        existingUser.name = name;
        existingUser.role = role;
        existingUser.phone = phone || existingUser.phone;
        existingUser.district = district || existingUser.district;
        existingUser.cropOrDept = cropOrDept || existingUser.cropOrDept;
        existingUser.designation = designation || existingUser.designation;
        await existingUser.save();
        return res.json({ message: 'User updated successfully', user: existingUser });
      }
      const newUser = new User({ name, email: cleanEmail, phone: phone || '', role, district, cropOrDept, designation });
      await newUser.save();
      return res.status(201).json({ message: 'User registered successfully', user: newUser });
    } else {
      const user = {
        _id: 'usr_' + Date.now(),
        name,
        email: cleanEmail,
        phone: phone || '',
        role,
        district: district || 'Anuradhapura',
        cropOrDept: cropOrDept || '',
        designation: designation || ''
      };
      memUsers.set(cleanEmail, user);
      saveStore();
      return res.status(201).json({ message: 'User registered successfully', user });
    }
  } catch (err) {
    res.status(500).json({ error: 'Registration failed', details: err.message });
  }
});

// --- Auth: Login (by email) ---
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (mongoose.connection.readyState === 1) {
      let user = await User.findOne({ email: cleanEmail });
      if (!user) {
        const defaultName = role === 'expert' ? 'Agronomist Officer' : 'Farmer Member';
        user = new User({
          email: cleanEmail,
          name: defaultName,
          role: role || 'farmer',
          district: 'Anuradhapura'
        });
        await user.save();
      }
      return res.json({ message: 'Login successful', user });
    } else {
      let user = memUsers.get(cleanEmail);
      if (!user) {
        const defaultName = role === 'expert' ? 'Agronomist Officer' : 'Farmer Member';
        user = {
          _id: 'usr_' + Date.now(),
          email: cleanEmail,
          name: defaultName,
          role: role || 'farmer',
          district: 'Anuradhapura'
        };
        memUsers.set(cleanEmail, user);
        saveStore();
      }
      return res.json({ message: 'Login successful', user });
    }
  } catch (err) {
    res.status(500).json({ error: 'Login failed', details: err.message });
  }
});

// --- Consultations: Get All with Filter & Expert Scope Support ---
app.get('/api/consultations', async (req, res) => {
  try {
    const { district, status, farmerPhone, farmerEmail, expertEmail, unassigned } = req.query;

    if (mongoose.connection.readyState === 1) {
      let filter = {};
      if (district && district !== 'all') filter.farmerDistrict = district;
      if (status && status !== 'all') filter.status = status;
      if (farmerPhone) filter.farmerPhone = farmerPhone;
      if (farmerEmail) filter.farmerEmail = farmerEmail.toLowerCase();
      if (expertEmail) filter.assignedExpertEmail = expertEmail.toLowerCase();
      if (unassigned === 'true' || unassigned === '1') {
        filter.$or = [
          { assignedExpertEmail: null },
          { assignedExpertEmail: '' },
          { status: 'Pending' }
        ];
      }
      const consultations = await Consultation.find(filter).sort({ createdAt: -1 });
      return res.json(consultations.map(c => ({
        ...c.toObject(),
        id: c._id.toString(),
        _id: c._id.toString()
      })));
    } else {
      let list = [...memConsultations];
      if (district && district !== 'all') list = list.filter(c => c.farmerDistrict === district);
      if (status && status !== 'all') list = list.filter(c => c.status === status);
      if (farmerPhone) list = list.filter(c => c.farmerPhone === farmerPhone);
      if (farmerEmail) list = list.filter(c => c.farmerEmail && c.farmerEmail.toLowerCase() === farmerEmail.toLowerCase());
      if (expertEmail) list = list.filter(c => c.assignedExpertEmail && c.assignedExpertEmail.toLowerCase() === expertEmail.toLowerCase());
      if (unassigned === 'true' || unassigned === '1') {
        list = list.filter(c => !c.assignedExpertEmail || c.status === 'Pending');
      }
      return res.json(list);
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch consultations', details: err.message });
  }
});

// --- Consultations: Get Single by ID or TicketID ---
app.get('/api/consultations/:id', async (req, res) => {
  try {
    const cid = req.params.id;
    if (mongoose.connection.readyState === 1) {
      let item = null;
      if (mongoose.Types.ObjectId.isValid(cid)) {
        item = await Consultation.findById(cid);
      }
      if (!item) {
        item = await Consultation.findOne({ $or: [{ ticketId: cid }, { _id: cid }] });
      }
      if (!item) return res.status(404).json({ error: 'Consultation ticket not found' });
      return res.json({ ...item.toObject(), id: item._id.toString(), _id: item._id.toString() });
    } else {
      const item = memConsultations.find(c => c.id === cid || c._id === cid || c.ticketId === cid);
      if (!item) return res.status(404).json({ error: 'Consultation ticket not found' });
      return res.json(item);
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch consultation', details: err.message });
  }
});

// --- Consultations: Create Ticket (Starts in Pending & Unassigned) ---
app.post('/api/consultations', async (req, res) => {
  try {
    const { farmerPhone, farmerEmail, farmerName, farmerDistrict, title, cropType, cropLabel, description, sampleImage } = req.body;
    if (!title || !description || !farmerName) {
      return res.status(400).json({ error: 'Title, description, and farmer name are required' });
    }

    const defaultImg = sampleImage || 'https://images.unsplash.com/photo-1586771107445-d3ca888129ff?auto=format&fit=crop&w=800&q=80';
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (mongoose.connection.readyState === 1) {
      const ticketCount = await Consultation.countDocuments();
      const ticketId = `GS-2026-${String(ticketCount + 101).padStart(3, '0')}`;
      const newTicket = new Consultation({
        ticketId,
        farmerEmail: (farmerEmail || '').toLowerCase().trim(),
        farmerPhone: farmerPhone || '',
        farmerName,
        farmerDistrict: farmerDistrict || 'Anuradhapura',
        title,
        cropType: cropType || 'paddy',
        cropLabel: cropLabel || 'Paddy / Rice',
        description,
        sampleImage: defaultImg,
        status: 'Pending',
        assignedExpertId: null,
        assignedExpertName: null,
        assignedExpertEmail: null,
        claimedAt: null
      });
      await newTicket.save();

      const initialMsg = new Message({
        consultationId: newTicket._id.toString(),
        senderName: farmerName,
        senderRole: 'farmer',
        senderEmail: (farmerEmail || '').toLowerCase().trim(),
        text: `Consultation Ticket Created: ${description}`,
        image: sampleImage || null,
        timestamp: timeStr
      });
      await initialMsg.save();

      const norm = {
        ...newTicket.toObject(),
        id: newTicket._id.toString(),
        _id: newTicket._id.toString()
      };
      return res.status(201).json({ message: 'Consultation ticket created', consultation: norm, ...norm });
    } else {
      const ticketId = `GS-2026-${String(memConsultations.length + 101).padStart(3, '0')}`;
      const id = 'con_' + Date.now();
      const newTicket = {
        _id: id,
        id,
        ticketId,
        farmerEmail: (farmerEmail || '').toLowerCase().trim(),
        farmerPhone: farmerPhone || '',
        farmerName,
        farmerDistrict: farmerDistrict || 'Anuradhapura',
        title,
        cropType: cropType || 'paddy',
        cropLabel: cropLabel || 'Paddy / Rice',
        description,
        sampleImage: defaultImg,
        status: 'Pending',
        assignedExpertId: null,
        assignedExpertName: null,
        assignedExpertEmail: null,
        claimedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      memConsultations.unshift(newTicket);
      memMessages[id] = [
        {
          _id: 'msg_' + Date.now(),
          id: 'msg_' + Date.now(),
          consultationId: id,
          senderName: farmerName,
          senderRole: 'farmer',
          senderEmail: (farmerEmail || '').toLowerCase().trim(),
          text: `Consultation Ticket Created: ${description}`,
          image: sampleImage || null,
          timestamp: timeStr,
          createdAt: new Date().toISOString()
        }
      ];
      saveStore();
      return res.status(201).json({ message: 'Consultation ticket created', consultation: newTicket, ...newTicket });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to create consultation', details: err.message });
  }
});

// --- Consultations: Claim Ticket (EXCLUSIVELY Assigns Ticket to Single Expert) ---
app.post('/api/consultations/:id/claim', async (req, res) => {
  try {
    const cid = req.params.id;
    const { expertName, expertEmail, expertId } = req.body;
    if (!expertEmail) {
      return res.status(400).json({ error: 'Expert email is required to claim a consultation' });
    }

    const cleanEmail = expertEmail.toLowerCase().trim();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (mongoose.connection.readyState === 1) {
      let consultation = mongoose.Types.ObjectId.isValid(cid)
        ? await Consultation.findById(cid)
        : await Consultation.findOne({ $or: [{ ticketId: cid }, { _id: cid }] });

      if (!consultation) return res.status(404).json({ error: 'Consultation ticket not found' });

      // Check if already claimed by someone else
      if (consultation.assignedExpertEmail && consultation.assignedExpertEmail.toLowerCase() !== cleanEmail) {
        return res.status(409).json({
          error: `This consultation is already claimed exclusively by ${consultation.assignedExpertName || 'another agronomist'} (${consultation.assignedExpertEmail}). Only they can access this chat.`,
          claimedBy: consultation.assignedExpertName,
          claimedEmail: consultation.assignedExpertEmail
        });
      }

      consultation.assignedExpertEmail = cleanEmail;
      consultation.assignedExpertName = expertName || consultation.assignedExpertName || 'Agronomist Officer';
      consultation.assignedExpertId = expertId || consultation.assignedExpertId || 'exp_' + Date.now();
      consultation.status = 'In Progress';
      consultation.claimedAt = new Date();
      consultation.updatedAt = new Date();
      await consultation.save();

      // System notification message in the chat
      const sysMsg = new Message({
        consultationId: consultation._id.toString(),
        senderName: 'GoviSahana Desk',
        senderRole: 'system',
        senderEmail: 'system@govisahana.lk',
        text: `👨‍🌾 Agronomist ${consultation.assignedExpertName} has accepted this case. Chat room is now active.`,
        timestamp: timeStr
      });
      await sysMsg.save();

      return res.json({
        message: 'Consultation claimed successfully',
        consultation: { ...consultation.toObject(), id: consultation._id.toString(), _id: consultation._id.toString() }
      });
    } else {
      const consultation = memConsultations.find(c => c.id === cid || c._id === cid || c.ticketId === cid);
      if (!consultation) return res.status(404).json({ error: 'Consultation ticket not found' });

      if (consultation.assignedExpertEmail && consultation.assignedExpertEmail.toLowerCase() !== cleanEmail) {
        return res.status(409).json({
          error: `This consultation is already claimed exclusively by ${consultation.assignedExpertName || 'another agronomist'} (${consultation.assignedExpertEmail}). Only they can access this chat.`,
          claimedBy: consultation.assignedExpertName,
          claimedEmail: consultation.assignedExpertEmail
        });
      }

      consultation.assignedExpertEmail = cleanEmail;
      consultation.assignedExpertName = expertName || consultation.assignedExpertName || 'Agronomist Officer';
      consultation.assignedExpertId = expertId || consultation.assignedExpertId || 'exp_' + Date.now();
      consultation.status = 'In Progress';
      consultation.claimedAt = new Date().toISOString();
      consultation.updatedAt = new Date().toISOString();

      const activeId = consultation.id || consultation._id;
      if (!memMessages[activeId]) memMessages[activeId] = [];
      memMessages[activeId].push({
        _id: 'msg_sys_' + Date.now(),
        id: 'msg_sys_' + Date.now(),
        consultationId: activeId,
        senderName: 'GoviSahana Desk',
        senderRole: 'system',
        senderEmail: 'system@govisahana.lk',
        text: `👨‍🌾 Agronomist ${consultation.assignedExpertName} has accepted this case. Chat room is now active.`,
        timestamp: timeStr,
        createdAt: new Date().toISOString()
      });

      saveStore();
      return res.json({ message: 'Consultation claimed successfully', consultation, ...consultation });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to claim consultation', details: err.message });
  }
});

// --- Consultations: Release Ticket (Back to Open Queue) ---
app.post('/api/consultations/:id/release', async (req, res) => {
  try {
    const cid = req.params.id;
    const { expertEmail } = req.body;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (mongoose.connection.readyState === 1) {
      let consultation = mongoose.Types.ObjectId.isValid(cid)
        ? await Consultation.findById(cid)
        : await Consultation.findOne({ $or: [{ ticketId: cid }, { _id: cid }] });
      if (!consultation) return res.status(404).json({ error: 'Consultation not found' });

      const prevExpert = consultation.assignedExpertName;
      consultation.assignedExpertEmail = null;
      consultation.assignedExpertName = null;
      consultation.assignedExpertId = null;
      consultation.status = 'Pending';
      consultation.claimedAt = null;
      consultation.updatedAt = new Date();
      await consultation.save();

      const sysMsg = new Message({
        consultationId: consultation._id.toString(),
        senderName: 'GoviSahana Desk',
        senderRole: 'system',
        senderEmail: 'system@govisahana.lk',
        text: `Inquiry released back to open agronomist queue by ${prevExpert || 'officer'}.`,
        timestamp: timeStr
      });
      await sysMsg.save();

      return res.json({ message: 'Consultation released back to queue', consultation });
    } else {
      const consultation = memConsultations.find(c => c.id === cid || c._id === cid || c.ticketId === cid);
      if (!consultation) return res.status(404).json({ error: 'Consultation not found' });

      const prevExpert = consultation.assignedExpertName;
      consultation.assignedExpertEmail = null;
      consultation.assignedExpertName = null;
      consultation.assignedExpertId = null;
      consultation.status = 'Pending';
      consultation.claimedAt = null;
      consultation.updatedAt = new Date().toISOString();

      const activeId = consultation.id || consultation._id;
      if (!memMessages[activeId]) memMessages[activeId] = [];
      memMessages[activeId].push({
        _id: 'msg_sys_' + Date.now(),
        id: 'msg_sys_' + Date.now(),
        consultationId: activeId,
        senderName: 'GoviSahana Desk',
        senderRole: 'system',
        senderEmail: 'system@govisahana.lk',
        text: `Inquiry released back to open agronomist queue by ${prevExpert || 'officer'}.`,
        timestamp: timeStr,
        createdAt: new Date().toISOString()
      });

      saveStore();
      return res.json({ message: 'Consultation released back to queue', consultation });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to release consultation', details: err.message });
  }
});

// --- Consultations: Get Messages ---
app.get('/api/consultations/:id/messages', async (req, res) => {
  try {
    const cid = req.params.id;
    if (mongoose.connection.readyState === 1) {
      let consultation = mongoose.Types.ObjectId.isValid(cid)
        ? await Consultation.findById(cid)
        : await Consultation.findOne({ $or: [{ ticketId: cid }, { _id: cid }] });

      const targetId = consultation ? consultation._id.toString() : cid;
      const messages = await Message.find({
        $or: [{ consultationId: targetId }, { consultationId: cid }]
      }).sort({ createdAt: 1 });

      return res.json(messages.map(m => ({
        ...m.toObject(),
        id: m._id.toString(),
        _id: m._id.toString()
      })));
    } else {
      const consultation = memConsultations.find(c => c.id === cid || c._id === cid || c.ticketId === cid);
      const activeId = consultation ? (consultation.id || consultation._id) : cid;
      const list = memMessages[activeId] || memMessages[cid] || [];
      return res.json(list);
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages', details: err.message });
  }
});

// --- Consultations: Send Message (Enforces Single Expert Access Rule) ---
app.post('/api/consultations/:id/messages', async (req, res) => {
  try {
    const cid = req.params.id;
    const { senderName, senderRole, senderEmail, text, image, prescription } = req.body;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const cleanEmail = (senderEmail || '').toLowerCase().trim();

    if (mongoose.connection.readyState === 1) {
      let consultation = mongoose.Types.ObjectId.isValid(cid)
        ? await Consultation.findById(cid)
        : await Consultation.findOne({ $or: [{ ticketId: cid }, { _id: cid }] });

      if (!consultation) return res.status(404).json({ error: 'Consultation ticket not found' });

      // SINGLE EXPERT ACCESS RULE ENFORCEMENT
      if (senderRole === 'expert') {
        if (consultation.assignedExpertEmail && cleanEmail && consultation.assignedExpertEmail.toLowerCase() !== cleanEmail) {
          return res.status(403).json({
            error: `Access Denied: This consultation is exclusively assigned to ${consultation.assignedExpertName} (${consultation.assignedExpertEmail}). Only they can reply to this farmer.`,
            assignedTo: consultation.assignedExpertName,
            assignedEmail: consultation.assignedExpertEmail
          });
        }
        // If not claimed yet, replying automatically claims it!
        if (!consultation.assignedExpertEmail) {
          consultation.assignedExpertEmail = cleanEmail || 'expert@govisahana.lk';
          consultation.assignedExpertName = senderName || 'Agronomist Officer';
          consultation.claimedAt = new Date();
        }
      }

      if (prescription) {
        consultation.prescription = prescription;
        consultation.status = 'Resolved';
      } else if (consultation.status === 'Pending') {
        consultation.status = 'In Progress';
      }
      consultation.updatedAt = new Date();
      await consultation.save();

      const newMsg = new Message({
        consultationId: consultation._id.toString(),
        senderName: senderName || 'User',
        senderRole: senderRole || 'farmer',
        senderEmail: cleanEmail,
        text: text || '',
        image: image || null,
        prescription: prescription || null,
        timestamp: timeStr
      });
      await newMsg.save();

      return res.status(201).json({
        ...newMsg.toObject(),
        id: newMsg._id.toString(),
        _id: newMsg._id.toString()
      });
    } else {
      const consultation = memConsultations.find(c => c.id === cid || c._id === cid || c.ticketId === cid);
      if (!consultation) return res.status(404).json({ error: 'Consultation ticket not found' });

      // SINGLE EXPERT ACCESS RULE ENFORCEMENT
      if (senderRole === 'expert') {
        if (consultation.assignedExpertEmail && cleanEmail && consultation.assignedExpertEmail.toLowerCase() !== cleanEmail) {
          return res.status(403).json({
            error: `Access Denied: This consultation is exclusively assigned to ${consultation.assignedExpertName} (${consultation.assignedExpertEmail}). Only they can reply to this farmer.`,
            assignedTo: consultation.assignedExpertName,
            assignedEmail: consultation.assignedExpertEmail
          });
        }
        // If not claimed yet, replying automatically claims it!
        if (!consultation.assignedExpertEmail) {
          consultation.assignedExpertEmail = cleanEmail || 'expert@govisahana.lk';
          consultation.assignedExpertName = senderName || 'Agronomist Officer';
          consultation.claimedAt = new Date().toISOString();
        }
      }

      if (prescription) {
        consultation.prescription = prescription;
        consultation.status = 'Resolved';
      } else if (consultation.status === 'Pending') {
        consultation.status = 'In Progress';
      }
      consultation.updatedAt = new Date().toISOString();

      const activeId = consultation.id || consultation._id;
      const newMsg = {
        _id: 'msg_' + Date.now(),
        id: 'msg_' + Date.now(),
        consultationId: activeId,
        senderName: senderName || 'User',
        senderRole: senderRole || 'farmer',
        senderEmail: cleanEmail,
        text: text || '',
        image: image || null,
        prescription: prescription || null,
        timestamp: timeStr,
        createdAt: new Date().toISOString()
      };

      if (!memMessages[activeId]) memMessages[activeId] = [];
      memMessages[activeId].push(newMsg);

      saveStore();
      return res.status(201).json(newMsg);
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message', details: err.message });
  }
});

// --- Consultations: Issue Official Remedy Prescription ---
app.post('/api/consultations/:id/prescription', async (req, res) => {
  try {
    const cid = req.params.id;
    const rxObj = req.body.prescription || req.body;
    const diagnosis = rxObj.diagnosis || 'General Agricultural Remedy';
    const treatment = rxObj.treatment || '';
    const dosage = rxObj.dosage || '';
    const timing = rxObj.timing || '';
    const expertName = rxObj.expertName || req.body.expertName || 'Senior Agronomist';
    const expertEmail = rxObj.expertEmail || req.body.expertEmail || '';
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const cleanEmail = (expertEmail || '').toLowerCase().trim();

    const prescription = {
      title: rxObj.title || `Official Agronomist Remedy: ${diagnosis}`,
      diagnosis,
      treatment,
      dosage,
      timing,
      expertName,
      issuedAt: new Date(),
      date: new Date().toLocaleDateString()
    };

    if (mongoose.connection.readyState === 1) {
      let consultation = mongoose.Types.ObjectId.isValid(cid)
        ? await Consultation.findById(cid)
        : await Consultation.findOne({ $or: [{ ticketId: cid }, { _id: cid }] });

      if (!consultation) return res.status(404).json({ error: 'Consultation ticket not found' });

      // If claimed by another expert, block
      if (consultation.assignedExpertEmail && cleanEmail && consultation.assignedExpertEmail.toLowerCase() !== cleanEmail) {
        return res.status(403).json({ error: `Only the assigned expert (${consultation.assignedExpertName}) can issue official prescriptions.` });
      }

      consultation.prescription = prescription;
      consultation.status = 'Resolved';
      consultation.updatedAt = new Date();
      await consultation.save();

      const rxMsg = new Message({
        consultationId: consultation._id.toString(),
        senderName: expertName || consultation.assignedExpertName || 'Agronomist Desk',
        senderRole: 'expert',
        senderEmail: cleanEmail,
        prescription: prescription,
        text: `Official Agronomist Prescription Issued for ${diagnosis}. Remedy: ${treatment}`,
        timestamp: timeStr
      });
      await rxMsg.save();

      return res.json({
        message: 'Prescription issued successfully',
        consultation: { ...consultation.toObject(), id: consultation._id.toString(), _id: consultation._id.toString() }
      });
    } else {
      const consultation = memConsultations.find(c => c.id === cid || c._id === cid || c.ticketId === cid);
      if (!consultation) return res.status(404).json({ error: 'Consultation ticket not found' });

      if (consultation.assignedExpertEmail && cleanEmail && consultation.assignedExpertEmail.toLowerCase() !== cleanEmail) {
        return res.status(403).json({ error: `Only the assigned expert (${consultation.assignedExpertName}) can issue official prescriptions.` });
      }

      consultation.prescription = prescription;
      consultation.status = 'Resolved';
      consultation.updatedAt = new Date().toISOString();

      const activeId = consultation.id || consultation._id;
      if (!memMessages[activeId]) memMessages[activeId] = [];
      memMessages[activeId].push({
        _id: 'msg_rx_' + Date.now(),
        id: 'msg_rx_' + Date.now(),
        consultationId: activeId,
        senderName: expertName || consultation.assignedExpertName || 'Agronomist Desk',
        senderRole: 'expert',
        senderEmail: cleanEmail,
        prescription: prescription,
        text: `Official Agronomist Prescription Issued for ${diagnosis}. Remedy: ${treatment}`,
        timestamp: timeStr,
        createdAt: new Date().toISOString()
      });

      saveStore();
      return res.json({ message: 'Prescription issued successfully', consultation, ...consultation });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to issue prescription', details: err.message });
  }
});

// Agro Data
app.get('/api/agro-data', (req, res) => {
  res.json({
    season: 'Maha Season 2026',
    soilHumidity: '78% Optimal',
    weatherForecast: 'Moderate rainfall expected across Dry Zone over next 48 hours. Hold nitrogen fertilizer application until clear weather.',
    marketRates: [
      { crop: 'Paddy (Samba)', price: 'Rs. 125/kg', trend: 'up' },
      { crop: 'Tea Green Leaf', price: 'Rs. 240/kg', trend: 'up' },
      { crop: 'Coconut', price: 'Rs. 95/nut', trend: 'up' },
      { crop: 'Black Pepper', price: 'Rs. 1,450/kg', trend: 'stable' }
    ]
  });
});

// Client-side fallback route
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

// Start server if running directly
if (!process.env.VERCEL) {
  ensureDbConnection().finally(() => {
    app.listen(PORT, () => {
      console.log(`🌾 GoviSahana Platform is live!`);
      console.log(`   ➜ Local:   http://localhost:${PORT}`);
      console.log(`   ➜ API:     http://localhost:${PORT}/api/health`);
      console.log(`   ➜ DB Mode: ${isDbConnected ? 'MongoDB Atlas Connected' : 'Persistent File Store (server/data/store.json)'}`);
    });
  });
}

module.exports = app;

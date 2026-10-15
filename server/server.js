const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
  profileImage: { type: String, default: '' },
  passwordHash: { type: String, default: '' },
  emailVerified: { type: Boolean, default: false },
  passwordChangedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

// OTP Schema
const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  purpose: { type: String, enum: ['registration', 'password_reset'], default: 'registration' },
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  lastSentAt: { type: Date, default: Date.now },
  verificationTokenHash: { type: String, default: '' },
  tokenExpiresAt: { type: Date, default: null },
  verifiedAt: { type: Date, default: null },
  attempts: { type: Number, default: 0 }
});
const OTP = mongoose.models.OTP || mongoose.model('OTP', otpSchema);

// Consultation Ticket Schema (With Dedicated Expert Claim & Access Tracking)
const consultationSchema = new mongoose.Schema({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  id: { type: String },
  ticketId: { type: String, required: true },
  farmerEmail: { type: String, default: '', lowercase: true, trim: true },
  farmerPhone: { type: String, default: '' },
  farmerName: { type: String, required: true },
  farmerDistrict: { type: String, required: true },
  title: { type: String, required: true },
  cropType: { type: String, required: true },
  cropLabel: { type: String, required: true },
  description: { type: String, required: true },
  sampleImage: { type: String, default: 'https://ik.imagekit.io/wfnazmyxh/Govi%20Sahana/v1_exact_uploaded_picture.png' },
  status: { type: String, enum: ['Pending', 'In Progress', 'Resolved'], default: 'Pending' },
  // Single Expert Claim Assignment:
  assignedExpertId: { type: String, default: null },
  assignedExpertName: { type: String, default: null },
  assignedExpertEmail: { type: String, default: null, lowercase: true, trim: true },
  assignmentMethod: { type: String, enum: ['automatic', 'manual', null], default: null },
  matchedSpecialty: { type: String, default: '' },
  suggestedExpertId: { type: String, default: null },
  suggestedExpertName: { type: String, default: null },
  suggestedExpertEmail: { type: String, default: null, lowercase: true, trim: true },
  suggestionStatus: { type: String, enum: ['Pending', 'Accepted', 'Rejected', 'Unavailable'], default: 'Unavailable' },
  suggestedAt: { type: Date, default: null },
  rejectedExpertEmails: [{ type: String, lowercase: true, trim: true }],
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
}, { _id: false });
const Consultation = mongoose.models.Consultation || mongoose.model('Consultation', consultationSchema);

// Chat Message Schema
const messageSchema = new mongoose.Schema({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  id: { type: String },
  consultationId: { type: String, required: true, index: true },
  senderName: { type: String, required: true },
  senderRole: { type: String, enum: ['farmer', 'expert', 'system'], required: true },
  senderEmail: { type: String, default: '', lowercase: true, trim: true },
  senderProfileImage: { type: String, default: '' },
  text: { type: String, default: '' },
  image: { type: String, default: null },
  prescription: { type: Object, default: null },
  timestamp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });
const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

// Global community chat shared by every authenticated farmer and expert.
const globalMessageSchema = new mongoose.Schema({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  id: { type: String },
  senderName: { type: String, required: true },
  senderRole: { type: String, enum: ['farmer', 'expert', 'system'], required: true },
  senderEmail: { type: String, default: '', lowercase: true, trim: true },
  senderProfileImage: { type: String, default: '' },
  text: { type: String, required: true, maxlength: 2000 },
  timestamp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });
const GlobalMessage = mongoose.models.GlobalMessage || mongoose.model('GlobalMessage', globalMessageSchema);

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
    sampleImage: 'https://ik.imagekit.io/wfnazmyxh/Govi%20Sahana/v1_exact_uploaded_picture.png',
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
    sampleImage: 'https://ik.imagekit.io/wfnazmyxh/Govi%20Sahana/v1_exact_uploaded_picture.png',
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
    sampleImage: 'https://ik.imagekit.io/wfnazmyxh/Govi%20Sahana/v1_exact_uploaded_picture.png',
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
      image: 'https://ik.imagekit.io/wfnazmyxh/Govi%20Sahana/v1_exact_uploaded_picture.png',
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
      image: 'https://ik.imagekit.io/wfnazmyxh/Govi%20Sahana/v1_exact_uploaded_picture.png',
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
      image: 'https://ik.imagekit.io/wfnazmyxh/Govi%20Sahana/v1_exact_uploaded_picture.png',
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
let memGlobalMessages = [
  {
    _id: 'global_welcome',
    id: 'global_welcome',
    senderName: 'GoviSahana Community',
    senderRole: 'system',
    senderEmail: 'system@govisahana.lk',
    text: 'Welcome to the GoviSahana global farming community. Farmers and verified experts can share knowledge here.',
    timestamp: 'Community notice',
    createdAt: new Date().toISOString()
  }
];

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
      if (Array.isArray(data.globalMessages) && data.globalMessages.length > 0) {
        memGlobalMessages = data.globalMessages;
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
      globalMessages: memGlobalMessages,
      users: Array.from(memUsers.values())
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('⚠️ Could not write local JSON store:', err.message);
  }
}

// Initial load
loadStore();

// Synchronize local JSON store with MongoDB Atlas
async function syncStoreWithDb() {
  if (mongoose.connection.readyState !== 1) return;
  try {
    const dbCount = await Consultation.countDocuments();
    if (dbCount === 0 && memConsultations.length > 0) {
      console.log(`🔄 Seeding ${memConsultations.length} initial consultations into MongoDB Atlas...`);
      for (const item of memConsultations) {
        const idStr = String(item._id || item.id);
        const exists = await Consultation.findOne({ $or: [{ _id: idStr }, { ticketId: item.ticketId }, { id: idStr }] });
        if (!exists) {
          const doc = new Consultation({
            ...item,
            _id: idStr,
            id: idStr,
            createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
            updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date()
          });
          await doc.save();
        }
      }

      for (const [conId, msgs] of Object.entries(memMessages)) {
        if (Array.isArray(msgs)) {
          for (const m of msgs) {
            const mId = String(m._id || m.id || ('msg_' + Date.now()));
            const mDoc = new Message({
              ...m,
              _id: mId,
              id: mId,
              consultationId: String(m.consultationId || conId),
              createdAt: m.createdAt ? new Date(m.createdAt) : new Date()
            });
            await mDoc.save();
          }
        }
      }

      const globalCount = await GlobalMessage.countDocuments();
      if (globalCount === 0 && memGlobalMessages.length > 0) {
        for (const item of memGlobalMessages) {
          await GlobalMessage.create({
            ...item,
            createdAt: item.createdAt ? new Date(item.createdAt) : new Date()
          });
        }
      }
      console.log('✅ Seeded store into MongoDB Atlas successfully!');
    }
  } catch (err) {
    console.warn('DB Sync Warning:', err.message);
  }
}

// Robust Consultation Lookup (Works with custom String IDs, ObjectIds, and Ticket IDs without CastError)
async function findConsultation(cid) {
  if (!cid) return null;
  const cleanId = String(cid).trim();

  // Try MongoDB if connected
  if (mongoose.connection.readyState === 1) {
    try {
      const orConditions = [
        { ticketId: cleanId },
        { id: cleanId },
        { _id: cleanId }
      ];
      if (mongoose.Types.ObjectId.isValid(cleanId) && String(new mongoose.Types.ObjectId(cleanId)) === cleanId) {
        orConditions.push({ _id: new mongoose.Types.ObjectId(cleanId) });
      }
      const item = await Consultation.findOne({ $or: orConditions });
      if (item) return item;
    } catch (err) {
      console.warn('DB consultation lookup warning:', err.message);
    }
  }

  // Fallback to memConsultations (JSON file store)
  const memItem = memConsultations.find(c =>
    String(c.id) === cleanId ||
    String(c._id) === cleanId ||
    String(c.ticketId).toLowerCase() === cleanId.toLowerCase()
  );
  return memItem || null;
}

const DEFAULT_EXPERT_DIRECTORY = [
  {
    _id: 'exp_1',
    name: 'Dr. Nimal Jayasinghe',
    email: 'nimal@govisahana.lk',
    cropOrDept: 'Paddy, crop pest and plant disease control'
  },
  {
    _id: 'exp_2',
    name: 'Mrs. Priyanthi Bandara',
    email: 'priyanthi@govisahana.lk',
    cropOrDept: 'Soil health, fertilizer management, coconut and plantation crops'
  },
  {
    _id: 'exp_3',
    name: 'Mr. K. Shanmugam',
    email: 'shanmugam@govisahana.lk',
    cropOrDept: 'Vegetables, fruits, horticulture and greenhouse crops'
  }
];

const CROP_MATCH_TERMS = {
  paddy: ['paddy', 'rice', 'disease', 'pest', 'crop'],
  vegetables: ['vegetable', 'horticulture', 'pest', 'disease'],
  upcountry_veg: ['vegetable', 'horticulture', 'greenhouse'],
  coconut: ['coconut', 'plantation', 'soil', 'pest'],
  tea: ['tea', 'plantation', 'soil', 'disease'],
  rubber: ['rubber', 'plantation', 'soil', 'disease'],
  cinnamon: ['cinnamon', 'spice', 'plantation', 'soil'],
  fruits: ['fruit', 'horticulture', 'pest', 'disease']
};

// Select the best specialty match, then prefer the expert with fewer active cases.
async function chooseExpertForProblem(cropType, title, description, excludedEmails = []) {
  let registeredExperts = [];
  if (mongoose.connection.readyState === 1) {
    try {
      registeredExperts = await User.find({ role: 'expert' }).lean();
    } catch (err) {
      console.warn('Expert matching DB lookup warning:', err.message);
    }
  }
  if (registeredExperts.length === 0) {
    registeredExperts = Array.from(memUsers.values()).filter(user => user.role === 'expert');
  }

  const byEmail = new Map();
  [...registeredExperts, ...DEFAULT_EXPERT_DIRECTORY].forEach(expert => {
    if (expert.email) byEmail.set(expert.email.toLowerCase(), expert);
  });

  const terms = CROP_MATCH_TERMS[cropType] || [String(cropType || ''), 'agriculture', 'crop'];
  const problemText = `${cropType || ''} ${title || ''} ${description || ''}`.toLowerCase();
  const activeLoad = memConsultations.reduce((counts, item) => {
    if (item.assignedExpertEmail && item.status !== 'Resolved') {
      const email = item.assignedExpertEmail.toLowerCase();
      counts[email] = (counts[email] || 0) + 1;
    }
    return counts;
  }, {});

  const excluded = new Set(excludedEmails.map(email => String(email).toLowerCase().trim()));
  const ranked = Array.from(byEmail.values()).filter(expert => !excluded.has(String(expert.email || '').toLowerCase())).map(expert => {
    const expertise = `${expert.cropOrDept || ''} ${expert.designation || ''}`.toLowerCase();
    const specialtyHits = terms.filter(term => expertise.includes(term)).length;
    const problemHits = terms.filter(term => problemText.includes(term)).length;
    const email = expert.email.toLowerCase();
    return {
      expert,
      email,
      score: (specialtyHits * 10) + problemHits - ((activeLoad[email] || 0) * 2),
      specialtyHits
    };
  }).sort((a, b) => b.score - a.score || (activeLoad[a.email] || 0) - (activeLoad[b.email] || 0));

  if (ranked.length === 0) return null;
  const selected = ranked[0].expert;
  return {
    id: String(selected._id || selected.id || `exp_${Date.now()}`),
    name: selected.name || 'Agricultural Expert',
    email: selected.email.toLowerCase(),
    specialty: selected.cropOrDept || selected.designation || 'General Agriculture'
  };
}

// Database Connection Manager with Serverless Connection Caching
async function ensureDbConnection() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    isDbConnected = true;
    return cachedDb;
  }
  try {
    cachedDb = await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 4000 });
    isDbConnected = true;
    console.log(`✅ Connected to MongoDB at: ${MONGODB_URI.replace(/:[^:]*@/, ':****@')}`);
    await syncStoreWithDb();
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

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const VERIFICATION_TOKEN_TTL_MS = 10 * 60 * 1000;
const OTP_PURPOSES = new Set(['registration', 'password_reset']);

const otpKey = (email, purpose) => `${purpose}:${email}`;
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const validPassword = (password) => typeof password === 'string' && password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);

function publicUser(user) {
  const result = user && typeof user.toObject === 'function' ? user.toObject() : { ...(user || {}) };
  delete result.passwordHash;
  delete result.__v;
  return result;
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) return reject(error);
      resolve(`scrypt$${salt}$${derivedKey.toString('hex')}`);
    });
  });
}

function verifyPassword(password, storedHash) {
  return new Promise((resolve) => {
    const [algorithm, salt, expectedHex] = String(storedHash || '').split('$');
    if (algorithm !== 'scrypt' || !salt || !expectedHex) return resolve(false);
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) return resolve(false);
      const expected = Buffer.from(expectedHex, 'hex');
      resolve(expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey));
    });
  });
}

// --- HELPER: Send OTP Email ---
async function sendOtpEmail(email, code, purpose = 'registration') {
  const isPasswordReset = purpose === 'password_reset';
  const heading = isPasswordReset ? 'Reset your GoviSahana password' : 'Verify your GoviSahana account';
  const emailHtml = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#f4f9f5;padding:32px;border-radius:16px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#1B5E20;font-size:28px;margin:0;">🌾 GoviSahana</h1>
        <p style="color:#555;font-size:13px;margin-top:6px;">Sri Lanka Agricultural Advisory Platform</p>
      </div>
      <div style="background:#fff;border-radius:12px;padding:24px;text-align:center;border:1px solid #c8e6c9;">
        <p style="color:#333;font-size:14px;margin:0 0 16px;">${heading}</p>
        <div style="background:#1B5E20;color:#fff;font-size:40px;font-weight:900;letter-spacing:10px;padding:16px 24px;border-radius:10px;display:inline-block;font-family:monospace;">
          ${code}
        </div>
        <p style="color:#888;font-size:12px;margin-top:16px;">This code expires in <strong>5 minutes</strong>.</p>
        <p style="color:#888;font-size:12px;">If you did not request this, please ignore this email.</p>
      </div>
      <p style="text-align:center;color:#aaa;font-size:11px;margin-top:20px;">GoviSahana • Cultivating Knowledge Together</p>
    </div>
  `;

  // Resend is the primary provider for OTP delivery.
  if (resend) {
    try {
      const response = await resend.emails.send({
        from: `GoviSahana <${process.env.RESEND_FROM_EMAIL || 'givisahana@developer.sushanfer.dev'}>`,
        to: email,
        subject: `${heading}: ${code}`,
        html: emailHtml
      });
      if (response && response.error) throw new Error(response.error.message || 'Resend API returned an error');
      console.log(`✉️ OTP email delivered via Resend to ${email}`);
      return response;
    } catch (apiErr) {
      console.warn(`Resend failed (${apiErr.message}), trying SMTP fallback...`);
    }
  }

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      return await transporter.sendMail({
        from: `"GoviSahana" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `${heading}: ${code}`,
        html: emailHtml
      });
    } catch (smtpErr) {
      console.warn(`SMTP fallback failed (${smtpErr.message}).`);
    }
  }

  throw new Error('No email service configured. Please set EMAIL_USER, EMAIL_PASS, or RESEND_API_KEY.');
}

async function findOtp(email, purpose) {
  if (mongoose.connection.readyState === 1) return OTP.findOne({ email, purpose });
  return memOtps.get(otpKey(email, purpose)) || null;
}

async function storeOtp(email, purpose, code, expiresAt) {
  const record = { email, purpose, code, expiresAt, lastSentAt: new Date(), verificationTokenHash: '', tokenExpiresAt: null, verifiedAt: null, attempts: 0 };
  if (mongoose.connection.readyState === 1) {
    await OTP.deleteMany({ email, purpose });
    await OTP.create(record);
  } else {
    memOtps.set(otpKey(email, purpose), record);
  }
}

async function issueOtp(email, purpose) {
  const existing = await findOtp(email, purpose);
  if (existing && existing.lastSentAt) {
    const elapsed = Date.now() - new Date(existing.lastSentAt).getTime();
    if (elapsed < OTP_RESEND_COOLDOWN_MS) {
      const error = new Error('Please wait before requesting another code.');
      error.status = 429;
      error.retryAfter = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
      throw error;
    }
  }
  const code = crypto.randomInt(100000, 1000000).toString();
  await storeOtp(email, purpose, code, new Date(Date.now() + OTP_TTL_MS));
  if (process.env.NODE_ENV !== 'production') console.log(`🔑 [${purpose} OTP for ${email}]: ${code}`);
  try {
    await sendOtpEmail(email, code, purpose);
    return { message: `Verification code sent to ${email}.` };
  } catch (mailError) {
    if (process.env.NODE_ENV !== 'production') {
      return { message: `Development verification code generated for ${email}.`, devCode: code };
    }
    const error = new Error('Email delivery is unavailable. Please try again shortly.');
    error.status = 503;
    throw error;
  }
}

async function verifyOtpAndCreateToken(email, purpose, code) {
  const record = await findOtp(email, purpose);
  if (!record) throw Object.assign(new Error('No verification code was found. Please request a new one.'), { status: 400 });
  if (Date.now() > new Date(record.expiresAt).getTime()) {
    if (mongoose.connection.readyState === 1) await OTP.deleteMany({ email, purpose });
    else memOtps.delete(otpKey(email, purpose));
    throw Object.assign(new Error('The verification code has expired. Please request a new one.'), { status: 400 });
  }
  if (String(record.code) !== String(code)) {
    const attempts = Number(record.attempts || 0) + 1;
    if (mongoose.connection.readyState === 1) {
      if (attempts >= 5) await OTP.deleteMany({ email, purpose });
      else await OTP.updateOne({ email, purpose }, { $set: { attempts } });
    } else if (attempts >= 5) {
      memOtps.delete(otpKey(email, purpose));
    } else {
      memOtps.set(otpKey(email, purpose), { ...record, attempts });
    }
    const message = attempts >= 5 ? 'Too many incorrect attempts. Please request a new code.' : 'The verification code is incorrect.';
    throw Object.assign(new Error(message), { status: attempts >= 5 ? 429 : 400 });
  }

  const verificationToken = crypto.randomBytes(32).toString('hex');
  const update = { code: '', verifiedAt: new Date(), verificationTokenHash: hashToken(verificationToken), tokenExpiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS) };
  if (mongoose.connection.readyState === 1) await OTP.updateOne({ email, purpose }, { $set: update });
  else memOtps.set(otpKey(email, purpose), { ...record, ...update });
  return verificationToken;
}

async function consumeVerificationToken(email, purpose, token) {
  const record = await findOtp(email, purpose);
  const valid = record && record.verifiedAt && record.tokenExpiresAt &&
    Date.now() <= new Date(record.tokenExpiresAt).getTime() &&
    record.verificationTokenHash === hashToken(String(token || ''));
  if (!valid) return false;
  if (mongoose.connection.readyState === 1) await OTP.deleteMany({ email, purpose });
  else memOtps.delete(otpKey(email, purpose));
  return true;
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
    const { email, purpose = 'registration' } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email address is required.' });
    }
    if (!OTP_PURPOSES.has(purpose)) return res.status(400).json({ error: 'Invalid verification purpose.' });
    const cleanEmail = email.toLowerCase().trim();
    return res.json(await issueOtp(cleanEmail, purpose));
  } catch (err) {
    console.error('OTP send error:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Failed to process OTP request.', retryAfter: err.retryAfter });
  }
});

// --- OTP: Verify ---
app.post('/api/otp/verify', async (req, res) => {
  try {
    const { email, code, purpose = 'registration' } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: 'Email and OTP code are required.' });
    }

    if (!OTP_PURPOSES.has(purpose)) return res.status(400).json({ error: 'Invalid verification purpose.' });
    const verificationToken = await verifyOtpAndCreateToken(email.toLowerCase().trim(), purpose, code);
    res.json({ message: 'Verification code confirmed.', verified: true, verificationToken });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'OTP verification failed.' });
  }
});

// --- Auth: Register ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, role, district, cropOrDept, designation, password, verificationToken } = req.body;
    if (!name || !email || !role || !password || !verificationToken) {
      return res.status(400).json({ error: 'Name, email, role, password, and email verification are required.' });
    }
    if (!['farmer', 'expert'].includes(role)) return res.status(400).json({ error: 'Invalid account role.' });
    if (!validPassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters and include a letter and a number.' });
    const cleanEmail = email.toLowerCase().trim();
    const verified = await consumeVerificationToken(cleanEmail, 'registration', verificationToken);
    if (!verified) return res.status(400).json({ error: 'Email verification has expired or is invalid. Please request a new code.' });
    const passwordHash = await hashPassword(password);

    if (mongoose.connection.readyState === 1) {
      const existingUser = await User.findOne({ email: cleanEmail });
      if (existingUser) return res.status(409).json({ error: 'An account already exists for this email. Please sign in or reset the password.' });
      const newUser = new User({ name, email: cleanEmail, phone: phone || '', role, district, cropOrDept, designation, passwordHash, emailVerified: true });
      await newUser.save();
      return res.status(201).json({ message: 'User registered successfully', user: publicUser(newUser) });
    } else {
      if (memUsers.has(cleanEmail)) return res.status(409).json({ error: 'An account already exists for this email. Please sign in or reset the password.' });
      const user = {
        _id: 'usr_' + Date.now(),
        name,
        email: cleanEmail,
        phone: phone || '',
        role,
        district: district || 'Anuradhapura',
        cropOrDept: cropOrDept || '',
        designation: designation || '',
        passwordHash,
        emailVerified: true,
        createdAt: new Date().toISOString()
      };
      memUsers.set(cleanEmail, user);
      saveStore();
      return res.status(201).json({ message: 'User registered successfully', user: publicUser(user) });
    }
  } catch (err) {
    res.status(500).json({ error: 'Registration failed', details: err.message });
  }
});

// --- Auth: Login with email and password ---
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const cleanEmail = email.toLowerCase().trim();
    const user = mongoose.connection.readyState === 1 ? await User.findOne({ email: cleanEmail }) : memUsers.get(cleanEmail);
    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    return res.json({ message: 'Login successful', user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', details: err.message });
  }
});

// --- User profile: add, replace, or remove a profile photograph ---
app.put('/api/users/profile-photo', async (req, res) => {
  try {
    const cleanEmail = String(req.body.email || '').toLowerCase().trim();
    const profileImage = String(req.body.profileImage || '');
    if (!cleanEmail.includes('@')) return res.status(400).json({ error: 'A valid account email is required.' });
    if (profileImage && !/^data:image\/(jpeg|png|webp);base64,/i.test(profileImage)) {
      return res.status(400).json({ error: 'Profile photo must be a JPEG, PNG, or WebP image.' });
    }
    if (profileImage.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'Profile photo must be smaller than 4 MB.' });
    }

    if (mongoose.connection.readyState === 1) {
      const user = await User.findOneAndUpdate({ email: cleanEmail }, { profileImage }, { new: true });
      if (!user) return res.status(404).json({ error: 'Account not found.' });
      return res.json({ message: profileImage ? 'Profile photo updated.' : 'Profile photo removed.', user: publicUser(user) });
    }

    const user = memUsers.get(cleanEmail);
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    const updatedUser = { ...user, profileImage };
    memUsers.set(cleanEmail, updatedUser);
    saveStore();
    return res.json({ message: profileImage ? 'Profile photo updated.' : 'Profile photo removed.', user: publicUser(updatedUser) });
  } catch (err) {
    res.status(500).json({ error: 'Unable to update the profile photo.' });
  }
});

// --- Auth: Request, verify, and complete a password reset ---
app.post('/api/auth/password/forgot', async (req, res) => {
  try {
    const cleanEmail = String(req.body.email || '').toLowerCase().trim();
    if (!cleanEmail.includes('@')) return res.status(400).json({ error: 'Valid email address is required.' });
    const user = mongoose.connection.readyState === 1 ? await User.findOne({ email: cleanEmail }) : memUsers.get(cleanEmail);
    if (!user) return res.json({ message: 'If an account exists for this email, a reset code has been sent.' });
    const result = await issueOtp(cleanEmail, 'password_reset');
    return res.json({ ...result, message: 'If an account exists for this email, a reset code has been sent.' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Unable to send reset code.', retryAfter: err.retryAfter });
  }
});

app.post('/api/auth/password/verify', async (req, res) => {
  try {
    const cleanEmail = String(req.body.email || '').toLowerCase().trim();
    const resetToken = await verifyOtpAndCreateToken(cleanEmail, 'password_reset', req.body.code);
    res.json({ message: 'Reset code confirmed.', resetToken });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Unable to verify reset code.' });
  }
});

app.post('/api/auth/password/reset', async (req, res) => {
  try {
    const cleanEmail = String(req.body.email || '').toLowerCase().trim();
    if (!validPassword(req.body.newPassword)) return res.status(400).json({ error: 'Password must be at least 8 characters and include a letter and a number.' });
    const verified = await consumeVerificationToken(cleanEmail, 'password_reset', req.body.resetToken);
    if (!verified) return res.status(400).json({ error: 'The password reset session has expired or is invalid.' });
    const passwordHash = await hashPassword(req.body.newPassword);
    if (mongoose.connection.readyState === 1) {
      const user = await User.findOneAndUpdate({ email: cleanEmail }, { passwordHash, emailVerified: true, passwordChangedAt: new Date() });
      if (!user) return res.status(404).json({ error: 'Account not found.' });
    } else {
      const user = memUsers.get(cleanEmail);
      if (!user) return res.status(404).json({ error: 'Account not found.' });
      memUsers.set(cleanEmail, { ...user, passwordHash, emailVerified: true, passwordChangedAt: new Date().toISOString() });
      saveStore();
    }
    res.json({ message: 'Password updated. You can now sign in.' });
  } catch (err) {
    res.status(500).json({ error: 'Unable to reset password.' });
  }
});

// --- Consultations: Get All with Filter & Expert Scope Support ---
app.get('/api/consultations', async (req, res) => {
  try {
    const { district, status, farmerPhone, farmerEmail, expertEmail, unassigned } = req.query;

    let results = [];
    if (mongoose.connection.readyState === 1) {
      try {
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
        const dbItems = await Consultation.find(filter).sort({ createdAt: -1 });
        if (dbItems && dbItems.length > 0) {
          results = dbItems.map(c => {
            const obj = typeof c.toObject === 'function' ? c.toObject() : c;
            const cidStr = obj._id ? obj._id.toString() : obj.id;
            return { ...obj, id: cidStr, _id: cidStr };
          });
        }
      } catch (err) {
        console.warn('DB fetch warning, falling back to local store:', err.message);
      }
    }

    // If MongoDB returned nothing or wasn't connected, fallback to local store
    if (results.length === 0) {
      let list = [...memConsultations];
      if (district && district !== 'all') list = list.filter(c => c.farmerDistrict === district);
      if (status && status !== 'all') list = list.filter(c => c.status === status);
      if (farmerPhone) list = list.filter(c => c.farmerPhone === farmerPhone);
      if (farmerEmail) list = list.filter(c => c.farmerEmail && c.farmerEmail.toLowerCase() === farmerEmail.toLowerCase());
      if (expertEmail) list = list.filter(c => c.assignedExpertEmail && c.assignedExpertEmail.toLowerCase() === expertEmail.toLowerCase());
      if (unassigned === 'true' || unassigned === '1') {
        list = list.filter(c => !c.assignedExpertEmail || c.status === 'Pending');
      }
      results = list;
    }

    return res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch consultations', details: err.message });
  }
});

// --- Consultations: Get Single by ID or TicketID ---
app.get('/api/consultations/:id', async (req, res) => {
  try {
    const cid = req.params.id;
    const item = await findConsultation(cid);
    if (!item) return res.status(404).json({ error: 'Consultation ticket not found' });
    const obj = typeof item.toObject === 'function' ? item.toObject() : item;
    const cidStr = obj._id ? obj._id.toString() : obj.id;
    return res.json({ ...obj, id: cidStr, _id: cidStr });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch consultation', details: err.message });
  }
});

// --- Consultations: Create Ticket and Automatically Match an Expert ---
app.post('/api/consultations', async (req, res) => {
  try {
    const { farmerPhone, farmerEmail, farmerName, farmerDistrict, title, cropType, cropLabel, description, sampleImage } = req.body;
    if (!title || !description || !farmerName) {
      return res.status(400).json({ error: 'Title, description, and farmer name are required' });
    }

    const defaultImg = sampleImage || 'https://ik.imagekit.io/wfnazmyxh/Govi%20Sahana/v1_exact_uploaded_picture.png';
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const id = 'con_' + Date.now();
    const count = memConsultations.length;
    const ticketId = `GS-2026-${String(count + 101).padStart(3, '0')}`;
    const matchedExpert = await chooseExpertForProblem(cropType, title, description);

    const newTicketData = {
      _id: id,
      id: id,
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
      assignmentMethod: null,
      matchedSpecialty: matchedExpert?.specialty || '',
      suggestedExpertId: matchedExpert?.id || null,
      suggestedExpertName: matchedExpert?.name || null,
      suggestedExpertEmail: matchedExpert?.email || null,
      suggestionStatus: matchedExpert ? 'Pending' : 'Unavailable',
      suggestedAt: matchedExpert ? new Date().toISOString() : null,
      rejectedExpertEmails: [],
      claimedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const initialMsgData = {
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
    };
    const assignmentMsgData = matchedExpert ? {
      _id: 'msg_assign_' + Date.now(),
      id: 'msg_assign_' + Date.now(),
      consultationId: id,
      senderName: 'GoviSahana Desk',
      senderRole: 'system',
      senderEmail: 'system@govisahana.lk',
      text: `${matchedExpert.name} was suggested for this problem and has been invited to accept it. The request remains open to all experts until someone accepts.`,
      timestamp: timeStr,
      createdAt: new Date().toISOString()
    } : null;

    if (mongoose.connection.readyState === 1) {
      try {
        const newTicket = new Consultation({
          ...newTicketData,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        await newTicket.save();

        const initialMsg = new Message({
          ...initialMsgData,
          createdAt: new Date()
        });
        await initialMsg.save();
        if (assignmentMsgData) {
          await new Message({ ...assignmentMsgData, createdAt: new Date() }).save();
        }
      } catch (dbErr) {
        console.warn('DB create consultation warning:', dbErr.message);
      }
    }

    memConsultations.unshift(newTicketData);
    memMessages[id] = assignmentMsgData ? [initialMsgData, assignmentMsgData] : [initialMsgData];
    saveStore();

    return res.status(201).json({
      message: matchedExpert ? `Consultation created and offered to ${matchedExpert.name}` : 'Consultation ticket created',
      consultation: newTicketData,
      ...newTicketData
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create consultation', details: err.message });
  }
});

// --- Consultations: Accept Ticket (First Expert to Accept Wins Atomically) ---
app.post('/api/consultations/:id/claim', async (req, res) => {
  try {
    const cid = req.params.id;
    const { expertName, expertEmail, expertId } = req.body;
    if (!expertEmail) {
      return res.status(400).json({ error: 'Expert email is required to claim a consultation' });
    }

    const cleanEmail = expertEmail.toLowerCase().trim();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let consultation = await findConsultation(cid);
    if (!consultation) return res.status(404).json({ error: 'Consultation ticket not found' });

    const currentAssignee = String(consultation.assignedExpertEmail || '').toLowerCase().trim();
    if (currentAssignee === cleanEmail) {
      const existing = typeof consultation.toObject === 'function' ? consultation.toObject() : consultation;
      return res.json({ message: 'You already accepted this consultation', consultation: existing, ...existing });
    }
    if (currentAssignee) {
      return res.status(409).json({
        error: `This consultation was already accepted by ${consultation.assignedExpertName || 'another expert'}.`,
        claimedBy: consultation.assignedExpertName,
        claimedEmail: consultation.assignedExpertEmail
      });
    }
    if (consultation.status === 'Resolved') {
      return res.status(409).json({ error: 'This consultation is already resolved.' });
    }

    const expDisplayName = expertName || 'Agronomist Officer';
    const isSuggestedExpert = String(consultation.suggestedExpertEmail || '').toLowerCase().trim() === cleanEmail;
    const targetId = consultation._id ? consultation._id.toString() : (consultation.id || cid);
    const acceptedAt = new Date();
    const assignmentMethod = isSuggestedExpert ? 'automatic' : 'manual';

    // MongoDB uses one conditional update so two experts cannot win the same request.
    if (typeof consultation.save === 'function') {
      const claimed = await Consultation.findOneAndUpdate({
        _id: targetId,
        status: 'Pending',
        $or: [
          { assignedExpertEmail: null },
          { assignedExpertEmail: '' },
          { assignedExpertEmail: { $exists: false } }
        ]
      }, {
        $set: {
          assignedExpertEmail: cleanEmail,
          assignedExpertName: expDisplayName,
          assignedExpertId: expertId || 'exp_' + Date.now(),
          assignmentMethod,
          suggestionStatus: 'Accepted',
          status: 'In Progress',
          claimedAt: acceptedAt,
          updatedAt: acceptedAt
        }
      }, { new: true });

      if (!claimed) {
        const winner = await findConsultation(targetId);
        return res.status(409).json({
          error: winner?.assignedExpertName
            ? `This consultation was just accepted by ${winner.assignedExpertName}.`
            : 'This consultation is no longer available.',
          claimedBy: winner?.assignedExpertName || null,
          claimedEmail: winner?.assignedExpertEmail || null
        });
      }
      consultation = claimed;
    } else {
      consultation.assignedExpertEmail = cleanEmail;
      consultation.assignedExpertName = expDisplayName;
      consultation.assignedExpertId = expertId || 'exp_' + Date.now();
      consultation.assignmentMethod = assignmentMethod;
      consultation.suggestionStatus = 'Accepted';
      consultation.status = 'In Progress';
      consultation.claimedAt = acceptedAt;
      consultation.updatedAt = acceptedAt;
    }

    const sysMsgData = {
      _id: 'msg_sys_' + Date.now(),
      id: 'msg_sys_' + Date.now(),
      consultationId: targetId,
      senderName: 'GoviSahana Desk',
      senderRole: 'system',
      senderEmail: 'system@govisahana.lk',
      text: `👨‍🌾 Agronomist ${expDisplayName} has accepted this case. Chat room is now active.`,
      timestamp: timeStr,
      createdAt: new Date().toISOString()
    };

    if (typeof consultation.save === 'function') {
      try {
        const sysMsg = new Message({
          ...sysMsgData,
          createdAt: new Date()
        });
        await sysMsg.save();
      } catch (dbErr) {
        console.warn('DB claim save warning:', dbErr.message);
      }
    }

    // Always update memConsultations & store.json
    const memCons = memConsultations.find(c => String(c.id) === targetId || String(c._id) === targetId || String(c.ticketId) === targetId);
    if (memCons) {
      memCons.assignedExpertEmail = cleanEmail;
      memCons.assignedExpertName = expDisplayName;
      memCons.assignedExpertId = expertId || memCons.assignedExpertId || 'exp_' + Date.now();
      memCons.status = 'In Progress';
      memCons.assignmentMethod = assignmentMethod;
      memCons.suggestionStatus = 'Accepted';
      memCons.claimedAt = acceptedAt.toISOString();
      memCons.updatedAt = acceptedAt.toISOString();
    }
    if (!memMessages[targetId]) memMessages[targetId] = [];
    memMessages[targetId].push(sysMsgData);
    saveStore();

    const norm = typeof consultation.toObject === 'function' ? consultation.toObject() : consultation;
    return res.json({ message: 'Consultation accepted successfully', consultation: norm, ...norm });
  } catch (err) {
    res.status(500).json({ error: 'Failed to accept consultation', details: err.message });
  }
});

// --- Consultations: Suggested Expert Rejects and the System Offers the Next Match ---
app.post('/api/consultations/:id/reject', async (req, res) => {
  try {
    const cid = req.params.id;
    const cleanEmail = String(req.body.expertEmail || '').toLowerCase().trim();
    if (!cleanEmail) return res.status(400).json({ error: 'Expert email is required.' });

    let consultation = await findConsultation(cid);
    if (!consultation) return res.status(404).json({ error: 'Consultation ticket not found' });
    if (consultation.assignedExpertEmail) {
      return res.status(409).json({ error: `This consultation was already accepted by ${consultation.assignedExpertName || 'another expert'}.` });
    }
    const suggestedEmail = String(consultation.suggestedExpertEmail || '').toLowerCase().trim();
    if (!suggestedEmail || suggestedEmail !== cleanEmail || consultation.suggestionStatus !== 'Pending') {
      return res.status(403).json({ error: 'Only the currently suggested expert can reject this invitation.' });
    }

    const excludedEmails = [...(consultation.rejectedExpertEmails || []), cleanEmail];
    const nextExpert = await chooseExpertForProblem(
      consultation.cropType,
      consultation.title,
      consultation.description,
      excludedEmails
    );
    const targetId = consultation._id ? consultation._id.toString() : (consultation.id || cid);
    const changedAt = new Date();
    const suggestionUpdate = {
      suggestedExpertId: nextExpert?.id || null,
      suggestedExpertName: nextExpert?.name || null,
      suggestedExpertEmail: nextExpert?.email || null,
      suggestedAt: nextExpert ? changedAt : null,
      suggestionStatus: nextExpert ? 'Pending' : 'Unavailable',
      matchedSpecialty: nextExpert?.specialty || '',
      updatedAt: changedAt
    };

    if (typeof consultation.save === 'function') {
      const updated = await Consultation.findOneAndUpdate({
        _id: targetId,
        status: 'Pending',
        suggestedExpertEmail: cleanEmail,
        suggestionStatus: 'Pending',
        $or: [
          { assignedExpertEmail: null },
          { assignedExpertEmail: '' },
          { assignedExpertEmail: { $exists: false } }
        ]
      }, {
        $set: suggestionUpdate,
        $addToSet: { rejectedExpertEmails: cleanEmail }
      }, { new: true });
      if (!updated) {
        const latest = await findConsultation(targetId);
        return res.status(409).json({
          error: latest?.assignedExpertName
            ? `This consultation was just accepted by ${latest.assignedExpertName}.`
            : 'This invitation has already changed.'
        });
      }
      consultation = updated;
    } else {
      Object.assign(consultation, suggestionUpdate, { rejectedExpertEmails: excludedEmails });
    }

    const rejectingName = req.body.expertName || 'The suggested expert';
    const systemMessage = {
      _id: 'msg_reject_' + Date.now(),
      id: 'msg_reject_' + Date.now(),
      consultationId: targetId,
      senderName: 'GoviSahana Desk',
      senderRole: 'system',
      senderEmail: 'system@govisahana.lk',
      text: nextExpert
        ? `${rejectingName} could not take this case. It has now been offered to ${nextExpert.name} and remains open to all experts.`
        : `${rejectingName} could not take this case. It remains open for any available expert to accept.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: changedAt.toISOString()
    };
    if (typeof consultation.save === 'function') {
      await new Message({ ...systemMessage, createdAt: changedAt }).save();
    }

    const memCons = memConsultations.find(item => String(item.id) === targetId || String(item._id) === targetId || String(item.ticketId) === targetId);
    if (memCons) Object.assign(memCons, suggestionUpdate, { rejectedExpertEmails: excludedEmails, updatedAt: changedAt.toISOString() });
    if (!memMessages[targetId]) memMessages[targetId] = [];
    memMessages[targetId].push(systemMessage);
    saveStore();

    const norm = typeof consultation.toObject === 'function' ? consultation.toObject() : consultation;
    return res.json({
      message: nextExpert ? `Invitation passed to ${nextExpert.name}` : 'Invitation rejected; request remains open',
      consultation: norm,
      ...norm
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reject invitation', details: err.message });
  }
});

// --- Consultations: Release Ticket (Back to Open Queue) ---
app.post('/api/consultations/:id/release', async (req, res) => {
  try {
    const cid = req.params.id;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const consultation = await findConsultation(cid);
    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });

    const releasingEmail = String(req.body.expertEmail || '').toLowerCase().trim();
    const assignedEmail = String(consultation.assignedExpertEmail || '').toLowerCase().trim();
    if (!assignedEmail || assignedEmail !== releasingEmail) {
      return res.status(403).json({ error: 'Only the assigned expert can release this consultation.' });
    }

    const prevExpert = consultation.assignedExpertName;
    consultation.assignedExpertEmail = null;
    consultation.assignedExpertName = null;
    consultation.assignedExpertId = null;
    consultation.assignmentMethod = null;
    consultation.matchedSpecialty = '';
    consultation.suggestedExpertId = null;
    consultation.suggestedExpertName = null;
    consultation.suggestedExpertEmail = null;
    consultation.suggestionStatus = 'Unavailable';
    consultation.suggestedAt = null;
    consultation.status = 'Pending';
    consultation.claimedAt = null;
    consultation.updatedAt = new Date();

    const targetId = consultation._id ? consultation._id.toString() : (consultation.id || cid);

    const sysMsgData = {
      _id: 'msg_sys_' + Date.now(),
      id: 'msg_sys_' + Date.now(),
      consultationId: targetId,
      senderName: 'GoviSahana Desk',
      senderRole: 'system',
      senderEmail: 'system@govisahana.lk',
      text: `Inquiry released back to open agronomist queue by ${prevExpert || 'officer'}.`,
      timestamp: timeStr,
      createdAt: new Date().toISOString()
    };

    if (typeof consultation.save === 'function') {
      try {
        await consultation.save();
        const sysMsg = new Message({
          ...sysMsgData,
          createdAt: new Date()
        });
        await sysMsg.save();
      } catch (dbErr) {
        console.warn('DB release save warning:', dbErr.message);
      }
    }

    const memCons = memConsultations.find(c => String(c.id) === targetId || String(c._id) === targetId || String(c.ticketId) === targetId);
    if (memCons) {
      memCons.assignedExpertEmail = null;
      memCons.assignedExpertName = null;
      memCons.assignedExpertId = null;
      memCons.assignmentMethod = null;
      memCons.matchedSpecialty = '';
      memCons.suggestedExpertId = null;
      memCons.suggestedExpertName = null;
      memCons.suggestedExpertEmail = null;
      memCons.suggestionStatus = 'Unavailable';
      memCons.suggestedAt = null;
      memCons.status = 'Pending';
      memCons.claimedAt = null;
      memCons.updatedAt = new Date().toISOString();
    }
    if (!memMessages[targetId]) memMessages[targetId] = [];
    memMessages[targetId].push(sysMsgData);
    saveStore();

    const norm = typeof consultation.toObject === 'function' ? consultation.toObject() : consultation;
    return res.json({ message: 'Consultation released back to queue', consultation: norm, ...norm });
  } catch (err) {
    res.status(500).json({ error: 'Failed to release consultation', details: err.message });
  }
});

// --- Consultations: Mark an Assigned Private Chat as Resolved ---
app.post('/api/consultations/:id/resolve', async (req, res) => {
  try {
    const consultation = await findConsultation(req.params.id);
    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });
    const expertEmail = String(req.body.expertEmail || '').toLowerCase().trim();
    const assignedEmail = String(consultation.assignedExpertEmail || '').toLowerCase().trim();
    if (!assignedEmail || assignedEmail !== expertEmail) {
      return res.status(403).json({ error: 'Only the assigned expert can resolve this consultation.' });
    }

    consultation.status = 'Resolved';
    consultation.updatedAt = new Date();
    const targetId = consultation._id ? consultation._id.toString() : (consultation.id || req.params.id);
    const systemMessage = {
      _id: 'msg_resolved_' + Date.now(),
      id: 'msg_resolved_' + Date.now(),
      consultationId: targetId,
      senderName: 'GoviSahana Desk',
      senderRole: 'system',
      senderEmail: 'system@govisahana.lk',
      text: `Consultation marked as resolved by ${consultation.assignedExpertName || 'the assigned expert'}.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: new Date().toISOString()
    };

    if (typeof consultation.save === 'function') {
      await consultation.save();
      await new Message({ ...systemMessage, createdAt: new Date() }).save();
    }
    const memCons = memConsultations.find(item => String(item.id) === targetId || String(item._id) === targetId);
    if (memCons) {
      memCons.status = 'Resolved';
      memCons.updatedAt = new Date().toISOString();
    }
    if (!memMessages[targetId]) memMessages[targetId] = [];
    memMessages[targetId].push(systemMessage);
    saveStore();
    return res.json({ message: 'Consultation resolved', consultation });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to resolve consultation', details: err.message });
  }
});

// --- Consultations: Get Messages ---
app.get('/api/consultations/:id/messages', async (req, res) => {
  try {
    const cid = req.params.id;
    const cleanId = String(cid).trim();
    const consultation = await findConsultation(cleanId);
    const targetId = consultation ? (consultation._id ? consultation._id.toString() : consultation.id) : cleanId;
    const requesterEmail = String(req.query.requesterEmail || '').toLowerCase().trim();
    const requesterRole = String(req.query.requesterRole || '').toLowerCase().trim();

    if (consultation && requesterEmail) {
      const farmerEmail = String(consultation.farmerEmail || '').toLowerCase().trim();
      const expertEmail = String(consultation.assignedExpertEmail || '').toLowerCase().trim();
      const hasAccess = (requesterRole === 'farmer' && requesterEmail === farmerEmail) ||
        (requesterRole === 'expert' && requesterEmail === expertEmail);
      if (!hasAccess) {
        return res.status(403).json({ error: 'This is a private consultation between the farmer and assigned expert.' });
      }
    }

    let dbMessages = [];
    if (mongoose.connection.readyState === 1) {
      try {
        dbMessages = await Message.find({
          $or: [
            { consultationId: targetId },
            { consultationId: cleanId },
            ...(consultation && consultation.ticketId ? [{ consultationId: consultation.ticketId }] : [])
          ]
        }).sort({ createdAt: 1 });
      } catch (err) {
        console.warn('DB fetch messages error:', err.message);
      }
    }

    if (dbMessages && dbMessages.length > 0) {
      return res.json(dbMessages.map(m => {
        const obj = typeof m.toObject === 'function' ? m.toObject() : m;
        const midStr = obj._id ? obj._id.toString() : obj.id;
        return { ...obj, id: midStr, _id: midStr };
      }));
    }

    const list = memMessages[targetId] || memMessages[cleanId] || [];
    return res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages', details: err.message });
  }
});

// --- Consultations: Send Message (Enforces Single Expert Access Rule) ---
app.post('/api/consultations/:id/messages', async (req, res) => {
  try {
    const cid = req.params.id;
    const { senderName, senderRole, senderEmail, senderProfileImage, text, image, prescription } = req.body;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const cleanEmail = (senderEmail || '').toLowerCase().trim();

    const consultation = await findConsultation(cid);
    if (!consultation) {
      return res.status(404).json({ error: 'Consultation ticket not found' });
    }

    // SINGLE EXPERT ACCESS RULE ENFORCEMENT
    if (senderRole === 'expert') {
      if (consultation.assignedExpertEmail && cleanEmail && consultation.assignedExpertEmail.toLowerCase() !== cleanEmail) {
        return res.status(403).json({
          error: `Access Denied: This consultation is exclusively assigned to ${consultation.assignedExpertName} (${consultation.assignedExpertEmail}). Only they can reply to this farmer.`,
          assignedTo: consultation.assignedExpertName,
          assignedEmail: consultation.assignedExpertEmail
        });
      }
      // An expert must explicitly accept before participating in the private chat.
      if (!consultation.assignedExpertEmail) {
        return res.status(409).json({ error: 'Accept this consultation before sending a private message.' });
      }
    }

    if (senderRole === 'farmer') {
      const farmerEmail = String(consultation.farmerEmail || '').toLowerCase().trim();
      if (farmerEmail && cleanEmail !== farmerEmail) {
        return res.status(403).json({ error: 'Only the farmer who created this consultation can send messages here.' });
      }
    }

    if (prescription) {
      consultation.prescription = prescription;
      consultation.status = 'Resolved';
    } else if (consultation.status === 'Pending' && consultation.assignedExpertEmail) {
      consultation.status = 'In Progress';
    }
    consultation.updatedAt = new Date();

    const targetId = consultation._id ? consultation._id.toString() : (consultation.id || cid);
    const msgId = 'msg_' + Date.now();

    const newMsgData = {
      _id: msgId,
      id: msgId,
      consultationId: targetId,
      senderName: senderName || 'User',
      senderRole: senderRole || 'farmer',
      senderEmail: cleanEmail,
      senderProfileImage: String(senderProfileImage || ''),
      text: text || '',
      image: image || null,
      prescription: prescription || null,
      timestamp: timeStr,
      createdAt: new Date().toISOString()
    };

    if (typeof consultation.save === 'function') {
      try {
        await consultation.save();
        const mongoMsg = new Message({
          ...newMsgData,
          createdAt: new Date()
        });
        await mongoMsg.save();
      } catch (dbErr) {
        console.warn('DB message save warning:', dbErr.message);
      }
    }

    const memCons = memConsultations.find(c => String(c.id) === targetId || String(c._id) === targetId || String(c.ticketId) === targetId);
    if (memCons) {
      memCons.status = consultation.status;
      memCons.assignedExpertEmail = consultation.assignedExpertEmail;
      memCons.assignedExpertName = consultation.assignedExpertName;
      memCons.prescription = consultation.prescription;
      memCons.updatedAt = new Date().toISOString();
    }
    if (!memMessages[targetId]) memMessages[targetId] = [];
    memMessages[targetId].push(newMsgData);
    if (cid !== targetId) {
      if (!memMessages[cid]) memMessages[cid] = [];
      memMessages[cid].push(newMsgData);
    }
    saveStore();

    return res.status(201).json(newMsgData);
  } catch (err) {
    console.error('Send message error:', err);
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

    const consultation = await findConsultation(cid);
    if (!consultation) return res.status(404).json({ error: 'Consultation ticket not found' });

    if (consultation.assignedExpertEmail && cleanEmail && consultation.assignedExpertEmail.toLowerCase() !== cleanEmail) {
      return res.status(403).json({ error: `Only the assigned expert (${consultation.assignedExpertName}) can issue official prescriptions.` });
    }

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

    consultation.prescription = prescription;
    consultation.status = 'Resolved';
    consultation.updatedAt = new Date();

    const targetId = consultation._id ? consultation._id.toString() : (consultation.id || cid);

    const rxMsgData = {
      _id: 'msg_rx_' + Date.now(),
      id: 'msg_rx_' + Date.now(),
      consultationId: targetId,
      senderName: expertName || consultation.assignedExpertName || 'Agronomist Desk',
      senderRole: 'expert',
      senderEmail: cleanEmail,
      prescription: prescription,
      text: `Official Agronomist Prescription Issued for ${diagnosis}. Remedy: ${treatment}`,
      timestamp: timeStr,
      createdAt: new Date().toISOString()
    };

    if (typeof consultation.save === 'function') {
      try {
        await consultation.save();
        const rxMsg = new Message({
          ...rxMsgData,
          createdAt: new Date()
        });
        await rxMsg.save();
      } catch (dbErr) {
        console.warn('DB rxMsg save warning:', dbErr.message);
      }
    }

    const memCons = memConsultations.find(c => String(c.id) === targetId || String(c._id) === targetId || String(c.ticketId) === targetId);
    if (memCons) {
      memCons.prescription = prescription;
      memCons.status = 'Resolved';
      memCons.updatedAt = new Date().toISOString();
    }
    if (!memMessages[targetId]) memMessages[targetId] = [];
    memMessages[targetId].push(rxMsgData);
    saveStore();

    const norm = typeof consultation.toObject === 'function' ? consultation.toObject() : consultation;
    return res.json({ message: 'Prescription issued successfully', consultation: norm, ...norm });
  } catch (err) {
    res.status(500).json({ error: 'Failed to issue prescription', details: err.message });
  }
});

// --- Global Community Chat: Shared by Farmers and Experts ---
app.get('/api/global-chat/messages', async (req, res) => {
  try {
    let items = [];
    if (mongoose.connection.readyState === 1) {
      try {
        items = await GlobalMessage.find({}).sort({ createdAt: 1 }).limit(300).lean();
      } catch (err) {
        console.warn('Global chat DB fetch warning:', err.message);
      }
    }
    if (items.length === 0) items = memGlobalMessages.slice(-300);
    return res.json(items.map(item => ({
      ...item,
      id: String(item._id || item.id),
      _id: String(item._id || item.id)
    })));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load global chat', details: err.message });
  }
});

app.post('/api/global-chat/messages', async (req, res) => {
  try {
    const { senderName, senderRole, senderEmail, senderProfileImage, text } = req.body;
    const cleanText = String(text || '').trim();
    const cleanRole = String(senderRole || '').toLowerCase();
    if (!senderName || !senderEmail || !['farmer', 'expert'].includes(cleanRole)) {
      return res.status(400).json({ error: 'A signed-in farmer or expert is required.' });
    }
    if (!cleanText) return res.status(400).json({ error: 'Message cannot be empty.' });
    if (cleanText.length > 2000) return res.status(400).json({ error: 'Message must be 2000 characters or fewer.' });

    const msgId = 'global_' + Date.now();
    const newMessage = {
      _id: msgId,
      id: msgId,
      senderName: String(senderName).trim(),
      senderRole: cleanRole,
      senderEmail: String(senderEmail).toLowerCase().trim(),
      senderProfileImage: String(senderProfileImage || ''),
      text: cleanText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: new Date().toISOString()
    };

    if (mongoose.connection.readyState === 1) {
      try {
        await new GlobalMessage({ ...newMessage, createdAt: new Date() }).save();
      } catch (err) {
        console.warn('Global chat DB save warning:', err.message);
      }
    }
    memGlobalMessages.push(newMessage);
    if (memGlobalMessages.length > 300) memGlobalMessages = memGlobalMessages.slice(-300);
    saveStore();
    return res.status(201).json(newMessage);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send global message', details: err.message });
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

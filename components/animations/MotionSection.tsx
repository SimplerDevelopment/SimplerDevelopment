'use client';

import { motion } from 'framer-motion';

// Re-export motion.section as a client component
// This allows us to use it in server components via import
export const MotionSection = motion.section;

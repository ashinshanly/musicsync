import React from 'react';
import { motion } from 'framer-motion';

interface LogoProps {
  className?: string;
  size?: number;
}

const Logo: React.FC<LogoProps> = ({ className = '', size = 120 }) => {
  return (
    <motion.div
      className={`relative ${className}`}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 400 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Music Note */}
        <path
          d="M150 100 L150 280 Q150 320 120 320 Q90 320 90 280 Q90 240 120 240 Q130 240 150 250"
          fill="url(#noteGradient)"
          stroke="none"
        />
        <circle
          cx="180"
          cy="280"
          r="40"
          fill="url(#noteGradient)"
        />
        
        {/* Headphones */}
        <path
          d="M90 240 Q90 180 150 180 Q210 180 210 240"
          stroke="url(#headphoneGradient)"
          strokeWidth="20"
          fill="none"
        />
        <path
          d="M70 240 L70 280 Q70 320 90 320"
          stroke="url(#headphoneGradient)"
          strokeWidth="20"
          fill="none"
        />
        <path
          d="M230 240 L230 280 Q230 320 210 320"
          stroke="url(#headphoneGradient)"
          strokeWidth="20"
          fill="none"
        />

        {/* Gradients */}
        <defs>
          <linearGradient id="noteGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF6B6B" />
            <stop offset="100%" stopColor="#FF8E8E" />
          </linearGradient>
          <linearGradient id="headphoneGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4A90E2" />
            <stop offset="100%" stopColor="#5FB2FF" />
          </linearGradient>
        </defs>
      </svg>
    </motion.div>
  );
};

export default Logo; 
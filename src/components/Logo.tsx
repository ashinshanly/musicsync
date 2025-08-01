import React from "react";
import { motion } from "framer-motion";
import logoImage from "../assets/logo.png";

interface LogoProps {
  className?: string;
  size?: number;
}

const Logo: React.FC<LogoProps> = ({ className = "", size = 120 }) => {
  return (
    <motion.div
      className={`relative ${className}`}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <img
        src={logoImage}
        alt="MusicSync Logo"
        style={{
          width: size,
          height: "auto",
          filter: "drop-shadow(0 0 10px rgba(0, 0, 0, 0.3))",
        }}
      />
    </motion.div>
  );
};

export default Logo;

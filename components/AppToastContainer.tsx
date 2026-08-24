"use client";

import { X } from "lucide-react";
import { ToastContainer, type CloseButtonProps } from "react-toastify";

function ToastCloseButton({ closeToast }: CloseButtonProps) {
  return <button className="dota-toast-close" type="button" onClick={closeToast} aria-label="بستن"><X aria-hidden="true" /></button>;
}

export default function AppToastContainer() {
  return (
    <ToastContainer
      position="bottom-left"
      autoClose={3_600}
      newestOnTop
      closeOnClick
      pauseOnFocusLoss
      pauseOnHover
      draggable
      rtl
      theme="dark"
      limit={4}
      closeButton={ToastCloseButton}
      className="dota-toast-container"
    />
  );
}

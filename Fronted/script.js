// DOM elements
const form = document.getElementById("contactForm");
const fileInput = document.getElementById("fileInput");
const fileInfo = document.getElementById("fileInfo");
const successMessage = document.getElementById("successMessage");

// Webhook URL
const WEBHOOK_URL = "https://aigent-staging.zuke.co.za/webhook/fbb44378-5d09-45f4-8393-19dbf91a317c";

// 🟢 Retrieve logged-in user's email (depending on your setup)
let userEmail = null;

// Option 1: from localStorage (most common)
if (localStorage.getItem("userEmail")) {
  userEmail = localStorage.getItem("userEmail");
}

// Option 2: from sessionStorage (temporary login sessions)
else if (sessionStorage.getItem("userEmail")) {
  userEmail = sessionStorage.getItem("userEmail");
}

// Option 3: from a global variable (if your system injects it dynamically)
else if (window.loggedInUserEmail) {
  userEmail = window.loggedInUserEmail;
}

// Fallback
if (!userEmail) {
  console.warn("⚠️ No user email found — make sure to store it in localStorage or a global variable.");
}

// File input display
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    // Check if file is a video
    if (!file.type.startsWith('video/')) {
      alert("Please select a video file only.");
      fileInput.value = "";
      fileInfo.textContent = "";
      return;
    }
    fileInfo.textContent = `Selected: ${file.name} (${formatFileSize(file.size)})`;
  } else {
    fileInfo.textContent = "";
  }
});

// Form submission
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!fileInput.files[0]) {
    alert("Please select a video file to upload.");
    return;
  }

  try {
    // 1. Upload file to Cloudinary first
    console.log("Uploading to Cloudinary...");
    const fileUrl = await uploadToCloudinary(fileInput.files[0]);
    console.log("Cloudinary URL:", fileUrl);

    // 2. Submit to your webhook with Cloudinary URL and user email
    console.log("Submitting to webhook...");
    const formData = new FormData();
    formData.append("name", document.getElementById("name").value);
    formData.append("notes", document.getElementById("notes").value);
    formData.append("fileUrl", fileUrl);

    // 🟢 Add user email automatically
    if (userEmail) {
      formData.append("email", userEmail);
    }

    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      body: formData
    });

    console.log("Webhook response status:", response.status);

    if (response.ok) {
      const responseData = await response.json();
      console.log("Webhook submission successful:", responseData);
      showSuccess();
    } else {
      const errorText = await response.text();
      console.error("Webhook error:", errorText);
      throw new Error(`Webhook returned status ${response.status}`);
    }

  } catch (err) {
    console.error("Error:", err);
    alert("There was an error processing your submission. Please try again.");
  }
});

// Upload helper function
async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "unsigned_preset"); // Replace with your preset

  const response = await fetch("https://api.cloudinary.com/v1_1/dl0u8tzae/upload", {
    method: "POST",
    body: formData
  });

  const data = await response.json();

  if (data.secure_url) {
    return data.secure_url;
  } else {
    throw new Error("Cloudinary upload failed");
  }
}

// Helper functions
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function showSuccess() {
  successMessage.style.display = "block";
  setTimeout(() => {
    successMessage.style.display = "none";
    form.reset();
    fileInfo.textContent = "";
  }, 3000);
}

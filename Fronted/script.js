// DOM elements
const form = document.getElementById("contactForm");
const optionCards = document.querySelectorAll(".option-card");
const fileInput = document.getElementById("fileInput");
const fileInfo = document.getElementById("fileInfo");
const urlInput = document.getElementById("urlInput");
const youtubeUrlField = document.getElementById("youtubeUrl");
const successMessage = document.getElementById("successMessage");

// Option selection logic
optionCards.forEach((card) => {
  card.addEventListener("click", () => {
    // Remove selected class from all cards
    optionCards.forEach((c) => c.classList.remove("selected"));

    // Add selected class to clicked card
    card.classList.add("selected");

    // Handle option-specific behavior
    const option = card.dataset.option;

    if (option === "file") {
      urlInput.classList.remove("show");
      youtubeUrlField.value = "";
      youtubeUrlField.removeAttribute("required");
    } else if (option === "url") {
      urlInput.classList.add("show");
      youtubeUrlField.setAttribute("required", "required");
      fileInput.value = "";
      fileInfo.textContent = "";
    }
  });
});

// File upload handling
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    fileInfo.textContent = `Selected: ${file.name} (${formatFileSize(file.size)})`;

    // Auto-select file option when file is chosen
    optionCards.forEach((c) => c.classList.remove("selected"));
    document.querySelector('[data-option="file"]').classList.add("selected");
    urlInput.classList.remove("show");
    youtubeUrlField.value = "";
    youtubeUrlField.removeAttribute("required");
  } else {
    fileInfo.textContent = "";
  }
});

// YouTube URL validation
youtubeUrlField.addEventListener("input", (e) => {
  const url = e.target.value;
  if (url && isValidYouTubeUrl(url)) {
    // Auto-select URL option when valid YouTube URL is entered
    optionCards.forEach((c) => c.classList.remove("selected"));
    document.querySelector('[data-option="url"]').classList.add("selected");
    fileInput.value = "";
    fileInfo.textContent = "";
  }
});

// Form submission
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const formData = new FormData(form);
  const selectedOption = document.querySelector(".option-card.selected");

  // Validation
  if (!selectedOption) {
    alert("Please select either file upload or YouTube URL option.");
    return;
  }

  const option = selectedOption.dataset.option;

  if (option === "file" && !fileInput.files[0]) {
    alert("Please select a file to upload.");
    return;
  }

  if (option === "url" && !youtubeUrlField.value) {
    alert("Please enter a YouTube URL.");
    return;
  }

  if (option === "url" && !isValidYouTubeUrl(youtubeUrlField.value)) {
    alert("Please enter a valid YouTube URL.");
    return;
  }

  // Simulate form submission
  showSuccess();

  // In a real application, you would send the data to a server:
  // submitFormData(formData, option);
});

// Helper functions
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function isValidYouTubeUrl(url) {
  const youtubeRegex =
    /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/)|youtu\.be\/)[\w-]+/;
  return youtubeRegex.test(url);
}

function showSuccess() {
  successMessage.style.display = "block";

  setTimeout(() => {
    successMessage.style.display = "none";
    form.reset();
    optionCards.forEach((c) => c.classList.remove("selected"));
    urlInput.classList.remove("show");
    fileInfo.textContent = "";
    youtubeUrlField.removeAttribute("required");
  }, 3000);
}

// Real form submission function (for server integration)
// Replace the existing submitFormData function with this:
function submitFormData(formData, option) {
  // Add the selected option to form data
  formData.append("option", option);

  fetch("http://localhost:3001/submit-form", {
    method: "POST",
    body: formData,
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        console.log("Success:", data);
        showSuccess();
      } else {
        throw new Error(data.error || "Submission failed");
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      alert("There was an error submitting the form. Please try again.");
    });
}

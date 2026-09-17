@echo off
echo Starting CUIMS Auto Feedback Local Test Server...
echo Open Chrome to: http://localhost:8080/test/mock_cuims_feedback.html
python -m http.server 8080
pause

window.onload = function() {
    document.getElementById('loginButton').addEventListener('click', login);
    document.getElementById('logoutButton').addEventListener('click', logout);
    document.getElementById('addLicenseButton').addEventListener('click', showAddLicenseForm);

    async function login() {
        console.log('Login function called');
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                document.getElementById('login-form').style.display = 'none';
                document.getElementById('license-management').style.display = 'block';
                loadLicenses();
            } else {
                alert('Login failed');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred during login');
        }
    }

    async function logout() {
        try {
            const response = await fetch('/logout', { method: 'POST' });
            if (response.ok) {
                document.getElementById('login-form').style.display = 'block';
                document.getElementById('license-management').style.display = 'none';
            }
        } catch (error) {
            console.error('Error:', error);
        }
    }

    function showAddLicenseForm() {
        const form = document.createElement('form');
        form.className = 'add-license-form';
        form.innerHTML = `
            <div class="add-license-grid">
                <div class="form-group">
                    <label for="licenseName">Názov licencie</label>
                    <input type="text" id="licenseName" placeholder="Zadajte názov licencie" required>
                </div>
                <div class="form-group">
                    <label for="expiryDate">Dátum expirácie</label>
                    <input type="date" id="expiryDate" required>
                </div>
            </div>
            
            <div class="file-input-container">
                <label for="attachmentFile">
                    <span>Vybrať súbor</span>
                </label>
                <input type="file" id="attachmentFile" accept=".pdf,.doc,.docx,.txt" 
                       onchange="updateFileName(this)">
                <div class="file-name" id="fileName">Nie je vybratý žiadny súbor</div>
            </div>
            
            <div class="form-group">
                <label for="comment">Komentár</label>
                <textarea id="comment" placeholder="Zadajte komentár" rows="4"></textarea>
            </div>
            
            <div class="form-buttons">
                <button type="submit" class="submit-button">Pridať licenciu</button>
                <button type="button" class="cancel-button" onclick="this.form.remove()">Zrušiť</button>
            </div>
        `;
        form.onsubmit = addLicense;
        document.body.appendChild(form);
    }

    async function addLicense(event) {
        event.preventDefault();
        const name = document.getElementById('licenseName').value;
        const expiry_date = document.getElementById('expiryDate').value;
        const created_date = new Date().toISOString().split('T')[0];
        const attachmentFile = document.getElementById('attachmentFile').files[0];
        const comment = document.getElementById('comment').value;

        const formData = new FormData();
        formData.append('name', name);
        formData.append('created_date', created_date);
        formData.append('expiry_date', expiry_date);
        if (attachmentFile) {
            formData.append('attachment', attachmentFile);
        }
        formData.append('comment', comment);

        try {
            const response = await fetch('/api/licenses', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                console.log('License added successfully:', result);
                loadLicenses();
                event.target.remove();
            } else {
                const errorData = await response.json();
                console.error('Server responded with an error:', errorData);
                alert(`Failed to add license: ${errorData.error}`);
            }
        } catch (error) {
            console.error('Error adding license:', error);
            alert(`An error occurred while adding the license: ${error.message}`);
        }
    }

    function showEditLicenseForm(license) {
        const form = document.createElement('form');
        form.className = 'add-license-form';
        form.innerHTML = `
            <div class="add-license-grid">
                <div class="form-group">
                    <label for="editLicenseName">Názov licencie</label>
                    <input type="text" id="editLicenseName" value="${license.name}" required>
                </div>
                <div class="form-group">
                    <label for="editExpiryDate">Dátum expirácie</label>
                    <input type="date" id="editExpiryDate" value="${license.expiry_date}" required>
                </div>
            </div>
            
            <div class="file-input-container">
                <label for="editAttachmentFile">
                    <span>Vybrať súbor</span>
                </label>
                <input type="file" id="editAttachmentFile" accept=".pdf,.doc,.docx,.txt" 
                       onchange="updateFileName(this)">
                <div class="file-name">Aktuálny súbor: ${license.attachment_path || 'Žiadny súbor'}</div>
            </div>
            
            <div class="form-group">
                <label for="editComment">Komentár</label>
                <textarea id="editComment" rows="4">${license.comment || ''}</textarea>
            </div>
            
            <div class="form-buttons">
                <button type="submit" class="submit-button">Uložiť zmeny</button>
                <button type="button" class="cancel-button" onclick="this.form.remove()">Zrušiť</button>
            </div>
        `;
        form.onsubmit = (event) => updateLicense(event, license.id, license.attachment_path);
        document.body.appendChild(form);
    }

    async function updateLicense(event, id, currentAttachmentPath) {
        event.preventDefault();
        const name = document.getElementById('editLicenseName').value;
        const expiry_date = document.getElementById('editExpiryDate').value;
        const attachmentFile = document.getElementById('editAttachmentFile').files[0];
        const comment = document.getElementById('editComment').value;

        const formData = new FormData();
        formData.append('name', name);
        formData.append('expiry_date', expiry_date);
        formData.append('comment', comment);
        
        if (attachmentFile) {
            formData.append('attachment', attachmentFile);
        } else {
            formData.append('existing_attachment_path', currentAttachmentPath);
        }

        try {
            const response = await fetch(`/api/licenses/${id}`, {
                method: 'PUT',
                body: formData
            });

            if (response.ok) {
                loadLicenses();
                event.target.remove();
            } else {
                const errorData = await response.json();
                console.error('Server responded with an error:', errorData);
                alert(`Failed to update license: ${errorData.error}`);
            }
        } catch (error) {
            console.error('Error updating license:', error);
            alert(`An error occurred while updating the license: ${error.message}`);
        }
    }

    async function loadLicenses() {
        try {
            const response = await fetch('/api/licenses');
            const licenses = await response.json();
            const tbody = document.querySelector('#license-table tbody');
            tbody.innerHTML = '';

            licenses.forEach(license => {
                const row = tbody.insertRow();
                row.insertCell(0).textContent = license.id;
                row.insertCell(1).textContent = license.name;
                row.insertCell(2).textContent = license.created_date;
                row.insertCell(3).textContent = license.expiry_date;
                
                const attachmentCell = row.insertCell(4);
                if (license.attachment_path) {
                    attachmentCell.innerHTML = `<a href="/api/licenses/${license.id}/download" target="_blank">Download</a>`;
                } else {
                    attachmentCell.textContent = 'No attachment';
                }
                
                row.insertCell(5).textContent = license.comment || '';
                
                const actionsCell = row.insertCell(6);
                actionsCell.innerHTML = `
                    <button onclick='showEditLicenseForm(${JSON.stringify(license)})'>Edit</button>
                    <button onclick='deleteLicense(${license.id})'>Delete</button>
                    <button onclick='toggleLogs(${license.id})'>Show Logs</button>
                `;

                const daysUntilExpiry = getDaysUntilExpiry(license.expiry_date);
                if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
                    row.classList.add('expiring-soon');
                } else if (daysUntilExpiry <= 90 && daysUntilExpiry > 30) {
                    row.classList.add('expiring-warning');
                }

                // Pridanie riadku pre logy (spočiatku skrytý)
                const logRow = tbody.insertRow();
                logRow.id = `logs-${license.id}`;
                const logCell = logRow.insertCell(0);
                logCell.colSpan = 7;
                logCell.classList.add('logs-cell');
                logRow.style.display = 'none';
            });
        } catch (error) {
            console.error('Error:', error);
        }
    }

    async function deleteLicense(id) {
        if (confirm('Are you sure you want to delete this license?')) {
            try {
                const response = await fetch(`/api/licenses/${id}`, { method: 'DELETE' });
                if (response.ok) {
                    loadLicenses();
                } else {
                    const errorData = await response.json();
                    console.error('Server responded with an error:', errorData);
                    alert(`Failed to delete license: ${errorData.error}`);
                }
            } catch (error) {
                console.error('Error deleting license:', error);
                alert(`An error occurred while deleting the license: ${error.message}`);
            }
        }
    }

    async function toggleLogs(id) {
        const logRow = document.getElementById(`logs-${id}`);
        if (logRow.style.display === 'none') {
            try {
                const response = await fetch(`/api/licenses/${id}/logs`);
                const logs = await response.json();
                
                let logsHtml = '<div class="logs-content">';
                logsHtml += '<h3>License Activity Log</h3>';
                if (logs.length === 0) {
                    logsHtml += '<p>No activity logs found for this license.</p>';
                } else {
                    logsHtml += '<ul>';
                    logs.forEach(log => {
                        let logText = `${log.username || 'Unknown user'} ${log.action}d the license`;
                        if (log.changes) {
                            logText += `: ${log.changes}`;
                        }
                        logText += ` on ${new Date(log.timestamp).toLocaleString()}`;
                        logsHtml += `<li>${logText}</li>`;
                    });
                    logsHtml += '</ul>';
                }
                logsHtml += '</div>';
                
                const logCell = logRow.cells[0];
                logCell.innerHTML = logsHtml;
                logRow.style.display = 'table-row';
            } catch (error) {
                console.error('Error fetching logs:', error);
                alert(`An error occurred while fetching logs: ${error.message}`);
            }
        } else {
            logRow.style.display = 'none';
        }
    }

    function getDaysUntilExpiry(expiryDate) {
        const today = new Date();
        const expiry = new Date(expiryDate);
        const differenceInTime = expiry.getTime() - today.getTime();
        return Math.ceil(differenceInTime / (1000 * 3600 * 24));
    }

    // Expose functions to global scope for use in HTML
    window.showEditLicenseForm = showEditLicenseForm;
    window.deleteLicense = deleteLicense;
    window.toggleLogs = toggleLogs;
    window.updateFileName = updateFileName;
};

function updateFileName(input) {
    const fileName = input.files.length > 0 
        ? input.files[0].name 
        : 'Nie je vybratý žiadny súbor';
    input.parentElement.querySelector('.file-name').textContent = fileName;
}
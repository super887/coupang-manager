document.addEventListener('DOMContentLoaded', async () => {
  const assignedAccountInput = document.getElementById('assignedAccount');
  const folderNameInput = document.getElementById('folderName');
  const includeAccountPrefixCheck = document.getElementById('includeAccountPrefix');
  const saveBtn = document.getElementById('saveBtn');
  const resetTaskBtn = document.getElementById('resetTaskBtn');
  const statusMsg = document.getElementById('statusMsg');
  const chipsContainer = document.getElementById('accountChips');

  // 저장된 설정 불러오기
  const data = await chrome.storage.local.get([
    'assignedAccount',
    'folderName',
    'includeAccountPrefix',
    'knownAccounts',
  ]);

  assignedAccountInput.value = data.assignedAccount || '';
  folderNameInput.value = data.folderName || '쿠팡리뷰인증';
  includeAccountPrefixCheck.checked = data.includeAccountPrefix !== false;

  // 웹 대시보드에서 동기화된 계정주 목록이 있으면 칩 버튼 갱신
  if (Array.isArray(data.knownAccounts) && data.knownAccounts.length > 0) {
    chipsContainer.innerHTML = '';
    const autoBtn = document.createElement('button');
    autoBtn.type = 'button';
    autoBtn.className = 'chip';
    autoBtn.dataset.name = '';
    autoBtn.textContent = '자동감지';
    chipsContainer.appendChild(autoBtn);

    data.knownAccounts.forEach((name) => {
      if (!name) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.dataset.name = name;
      btn.textContent = name;
      chipsContainer.appendChild(btn);
    });
  }

  chipsContainer.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    assignedAccountInput.value = chip.dataset.name || '';
  });

  saveBtn.addEventListener('click', async () => {
    const assignedAccount = assignedAccountInput.value.trim();
    const folderName = folderNameInput.value.trim() || '쿠팡리뷰인증';
    const includeAccountPrefix = includeAccountPrefixCheck.checked;

    await chrome.storage.local.set({
      assignedAccount,
      folderName,
      includeAccountPrefix,
    });

    statusMsg.textContent = '✅ 설정이 저장되었습니다!';
    setTimeout(() => {
      statusMsg.textContent = '';
    }, 2500);
  });

  resetTaskBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove('activeReviewTask');
    statusMsg.textContent = '🔄 대기열/진행 작업이 초기화되었습니다.';
    setTimeout(() => {
      statusMsg.textContent = '';
    }, 2500);
  });
});

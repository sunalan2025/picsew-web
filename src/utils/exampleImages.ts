/** Original local demo content; no user data or remote image request. */
export async function createExampleFiles(): Promise<File[]> {
  const article = document.createElement('canvas');
  article.width = 420;
  article.height = 1320;
  const ctx = article.getContext('2d');
  if (!ctx) throw new Error('浏览器无法生成示例，请直接添加自己的截图');
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 420, 1320);
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(0, 0, 420, 105);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 25px system-ui';
  ctx.fillText('周末出游计划', 28, 48);
  ctx.font = '14px system-ui';
  ctx.fillText('这三张截图有重复内容，可以自动拼成一张', 28, 80);
  const activities = [
    '出发前的准备',
    '沿河步道散步',
    '在树荫下休息',
    '午餐与补给',
    '拍下沿途风景',
    '乘车返回',
  ];
  for (let section = 0; section < activities.length; section++) {
    const y = 130 + section * 190;
    ctx.fillStyle = [
      '#dbeafe',
      '#dcfce7',
      '#fef3c7',
      '#ede9fe',
      '#fce7f3',
      '#cffafe',
    ][section];
    ctx.fillRect(20, y, 380, 164);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px system-ui';
    ctx.fillText(`${section + 1}. ${activities[section]}`, 36, y + 35);
    ctx.font = '15px system-ui';
    for (let row = 0; row < 4; row++) {
      ctx.fillStyle = row % 2 ? '#475569' : '#1e3a8a';
      ctx.fillText(
        `${String(8 + section).padStart(2, '0')}:${row * 15 === 0 ? '00' : row * 15}  ${['带上水杯和舒适的鞋子', '和朋友一起慢慢欣赏风景', '记得留下一点休息的时间', '当天的美好瞬间都值得记录'][row]}`,
        36,
        y + 67 + row * 24
      );
    }
  }
  return Promise.all(
    [0, 360, 720].map(async (offset, index) => {
      const canvas = document.createElement('canvas');
      canvas.width = 420;
      canvas.height = 600;
      canvas
        .getContext('2d')!
        .drawImage(article, 0, offset, 420, 600, 0, 0, 420, 600);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b
              ? resolve(b)
              : reject(new Error('示例图片生成失败，请直接添加自己的截图')),
          'image/png'
        )
      );
      return new File([blob], `示例-${index + 1}.png`, { type: 'image/png' });
    })
  );
}

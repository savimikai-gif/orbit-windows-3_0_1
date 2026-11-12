using System.Windows.Forms;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Text.Json;

namespace ORBIT;

/// <summary>Resizable-looking compact Windows overlay; position saved across launches.
/// The overlay starts only when the user requests it, and is removable with its X.</summary>
internal sealed class MiniWidget : Form
{
    private readonly Label title = new()
    {
        Text = "◉   ORBIT  /  LIVE SYSTEM", AutoSize=false,
        Location = new Point(17, 12), Size=new Size(205, 30),
        Font=new Font("Segoe UI", 9.5f, FontStyle.Bold),
        ForeColor=Color.FromArgb(123,222,255), TextAlign=ContentAlignment.MiddleLeft
    };
    private readonly Label stats = new()
    {
        Text = "Sampling performance…", Location=new Point(18,53),Size=new Size(250,63),
        Font=new Font("Consolas",11), ForeColor=Color.WhiteSmoke, TextAlign=ContentAlignment.MiddleLeft
    };
    private readonly Button close = new()
    {
        Text="×",Location=new Point(254,12),Size=new Size(29,29),TabStop=true,
        FlatStyle=FlatStyle.Flat,BackColor=Color.FromArgb(25,53,73),ForeColor=Color.White,
    };
    private readonly System.Windows.Forms.Timer timer = new() { Interval=2200 };
    private readonly System.Windows.Forms.Timer positionTimer = new() { Interval=450 };
    private bool busy;
    private readonly double?[] values = new double?[3];
    private bool dragging;
    private Point cursorOrigin;
    private string PositionFile => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Orbit", "mini-widget.json");

    internal MiniWidget()
    {
        Text="ORBIT Performance"; FormBorderStyle=FormBorderStyle.None;
        BackColor=Color.FromArgb(14,29,46); Size=new Size(300,218);
        ShowInTaskbar=false; TopMost=true; Opacity=0.96;
        StartPosition=FormStartPosition.Manual;
        var working=Screen.PrimaryScreen!.WorkingArea;
        Location=new Point(working.Right - Width - 18, working.Bottom - Height - 18);
        try
        {
            if (File.Exists(PositionFile))
            {
                using var doc=JsonDocument.Parse(File.ReadAllText(PositionFile));
                int x=doc.RootElement.GetProperty("x").GetInt32();
                int y=doc.RootElement.GetProperty("y").GetInt32();
                var bounds=new Rectangle(x,y,Width,Height);
                if(Screen.AllScreens.Any(sc=>sc.WorkingArea.IntersectsWith(bounds))) Location=bounds.Location;
            }
        }catch(Exception ex){Program.LogError(ex);}
        close.FlatAppearance.BorderSize=0;
        close.Click+=(_,_)=>Hide();
        DoubleBuffered=true;
        Controls.Add(title); Controls.Add(close);
        foreach(Control c in new Control[]{this,title,stats})
        {
            c.MouseDown+=(_,e)=>{if(e.Button==MouseButtons.Left){dragging=true;cursorOrigin=Cursor.Position;}};
            c.MouseMove+=(_,_)=>
            {
                if(!dragging)return;
                var now=Cursor.Position;
                Location=new Point(Left+now.X-cursorOrigin.X,Top+now.Y-cursorOrigin.Y);
                cursorOrigin=now;
            };
            c.MouseUp+=(_,_)=>dragging=false;
        }
        Move+=(_,_)=>{positionTimer.Stop();positionTimer.Start();};
        positionTimer.Tick+=(_,_)=>{positionTimer.Stop();SavePosition();};
        timer.Tick+=async(_,_)=>await UpdateStats();
        Shown+=async(_,_)=>{timer.Start();await UpdateStats();};
        VisibleChanged+=(_,_)=>{if(Visible)timer.Start();else timer.Stop();};
        Resize+=(_,_)=>SetRoundedRegion();
        SetRoundedRegion();
        FormClosed+=(_,_)=>{timer.Dispose();positionTimer.Stop();positionTimer.Dispose();SavePosition();};
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;
        using var background=new LinearGradientBrush(ClientRectangle,Color.FromArgb(20,43,65),Color.FromArgb(8,20,35),45f);
        g.FillRectangle(background,ClientRectangle);
        using var labelFont=new Font("Segoe UI",9,FontStyle.Bold);
        using var valueFont=new Font("Segoe UI",12,FontStyle.Bold);
        using var labelBrush=new SolidBrush(Color.FromArgb(151,181,205));
        using var valueBrush=new SolidBrush(Color.FromArgb(222,244,255));
        using var trackBrush=new SolidBrush(Color.FromArgb(37,60,80));
        using var fillBrush=new SolidBrush(Color.FromArgb(77,194,247));
        string[] names=["CPU", "GPU", "MEMORY"];
        for(int i=0;i<3;i++)
        {
            int y=58+i*49;
            g.DrawString(names[i],labelFont,labelBrush,20,y);
            string value=values[i] is double n?n.ToString("0.0")+"%":"Unavailable";
            g.DrawString(value,valueFont,valueBrush,278-g.MeasureString(value,valueFont).Width,y-3);
            g.FillRectangle(trackBrush,20,y+25,258,4);
            if(values[i] is double percent)g.FillRectangle(fillBrush,20,y+25,(float)(258*Math.Clamp(percent,0,100)/100),4);
        }
    }
    private void SetRoundedRegion()
    {
        using var path=new GraphicsPath();
        int r=19;
        path.AddArc(0,0,r*2,r*2,180,90);
        path.AddArc(Width-r*2-1,0,r*2,r*2,270,90);
        path.AddArc(Width-r*2-1,Height-r*2-1,r*2,r*2,0,90);
        path.AddArc(0,Height-r*2-1,r*2,r*2,90,90);
        path.CloseFigure();
        Region?.Dispose();Region=new Region(path);
    }
    private void SavePosition()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(PositionFile)!);
            string tmp=PositionFile+".tmp";
            File.WriteAllText(tmp,JsonSerializer.Serialize(new{x=Left,y=Top}));
            File.Move(tmp,PositionFile,true);
        }catch(Exception ex){Program.LogError(ex);}
    }
    private async Task UpdateStats()
    {
        if(busy||IsDisposed||!Visible)return;
        busy=true;
        try
        {
            var result=await Task.Run(WindowsControl.Snapshot);
            using var doc=JsonDocument.Parse(JsonSerializer.Serialize(result));
            var root=doc.RootElement;
            string cpu=root.GetProperty("cpu").ValueKind==JsonValueKind.Null?"—":root.GetProperty("cpu").ToString()+"%";
            string ram=root.GetProperty("ram").ToString()+"%";
            if(!IsDisposed)
            {
                string[] names = ["cpu", "gpu", "ram"];
                for(int i=0;i<names.Length;i++) values[i]=root.GetProperty(names[i]).ValueKind==JsonValueKind.Null?null:root.GetProperty(names[i]).GetDouble();
                Invalidate();
            }
        }
        catch(Exception ex){if(!IsDisposed)stats.Text="Performance unavailable";AssistantDiagnostics.Write("monitor:overlay_error",ex.Message);}
        finally{busy=false;}
    }
}


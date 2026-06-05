// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock canvasStore — the component's only external dependency.
// We expose mutable variables so individual tests can swap out state.
// ---------------------------------------------------------------------------

let mockSelectedLayers: any[] = [];
let mockCanvas: any = null;

vi.mock('@/lib/designer/canvasStore', () => ({
  useCanvasStore: (selector: (s: any) => any) =>
    selector({
      selectedLayers: mockSelectedLayers,
      canvas: mockCanvas,
    }),
}));

// fabric is imported only for types in this component — no runtime import needed.

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------
import AlignmentToolbar from '@/components/storefront/designer/AlignmentToolbar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fake FabricObject at the given position/size. */
function makeFabricObj(left: number, top: number, width: number, height: number): any {
  const obj: any = {
    left,
    top,
    set: vi.fn((props: any) => {
      Object.assign(obj, props);
    }),
    setCoords: vi.fn(),
    getBoundingRect: vi.fn(() => ({ left, top, width, height })),
  };
  return obj;
}

/** Minimal surface (print-area info used by centerOnPrintArea). */
const fakeSurface: any = {
  printAreaX: 0,
  printAreaY: 0,
  printAreaWidth: 200,
  printAreaHeight: 300,
};

/** Build a minimal fake Canvas instance. */
function makeCanvas(
  activeObj: any | null,
  activeObjs: any[] = []
): any {
  return {
    getActiveObject: vi.fn(() => activeObj),
    getActiveObjects: vi.fn(() => activeObjs),
    fire: vi.fn(),
    requestRenderAll: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockSelectedLayers = [];
  mockCanvas = null;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Rendering / visibility
// ---------------------------------------------------------------------------

describe('AlignmentToolbar — rendering', () => {
  it('renders nothing when no layers are selected', () => {
    mockSelectedLayers = [];
    const { container } = render(<AlignmentToolbar surface={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the toolbar when 1 layer is selected', () => {
    mockSelectedLayers = [{ id: 'a' }];
    render(<AlignmentToolbar surface={null} />);
    expect(screen.getByRole('toolbar')).toBeTruthy();
  });

  it('has aria-label "Alignment and distribution"', () => {
    mockSelectedLayers = [{ id: 'a' }];
    render(<AlignmentToolbar surface={null} />);
    expect(screen.getByRole('toolbar', { name: /Alignment and distribution/i })).toBeTruthy();
  });

  it('renders 9 buttons for a single selection', () => {
    mockSelectedLayers = [{ id: 'a' }];
    render(<AlignmentToolbar surface={null} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(9);
  });

  it('applies a custom className', () => {
    mockSelectedLayers = [{ id: 'a' }];
    const { container } = render(<AlignmentToolbar surface={null} className="my-custom" />);
    expect((container.firstChild as HTMLElement).className).toContain('my-custom');
  });
});

// ---------------------------------------------------------------------------
// Button enabled/disabled state
// ---------------------------------------------------------------------------

describe('AlignmentToolbar — button enabled/disabled state', () => {
  it('enables all 6 alignment buttons and "Center on print area" when 1 layer selected and surface provided', () => {
    mockSelectedLayers = [{ id: 'a' }];
    render(<AlignmentToolbar surface={fakeSurface} />);
    const buttons = screen.getAllByRole('button');
    // First 6 are alignment, last is center-on-print-area (index 8).
    // Distribute buttons (index 6,7) should be disabled at count=1.
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(false);
    expect((buttons[5] as HTMLButtonElement).disabled).toBe(false);
    expect((buttons[8] as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables distribute buttons when fewer than 3 layers selected', () => {
    mockSelectedLayers = [{ id: 'a' }, { id: 'b' }];
    render(<AlignmentToolbar surface={fakeSurface} />);
    const distributeH = screen.getByRole('button', { name: /Distribute horizontally/i });
    const distributeV = screen.getByRole('button', { name: /Distribute vertically/i });
    expect((distributeH as HTMLButtonElement).disabled).toBe(true);
    expect((distributeV as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables distribute buttons when 3 or more layers selected', () => {
    mockSelectedLayers = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    render(<AlignmentToolbar surface={fakeSurface} />);
    const distributeH = screen.getByRole('button', { name: /Distribute horizontally/i });
    const distributeV = screen.getByRole('button', { name: /Distribute vertically/i });
    expect((distributeH as HTMLButtonElement).disabled).toBe(false);
    expect((distributeV as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables "Center on print area" when surface is null', () => {
    mockSelectedLayers = [{ id: 'a' }];
    render(<AlignmentToolbar surface={null} />);
    const btn = screen.getByRole('button', { name: /Center on print area/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables "Center on print area" when surface is provided', () => {
    mockSelectedLayers = [{ id: 'a' }];
    render(<AlignmentToolbar surface={fakeSurface} />);
    const btn = screen.getByRole('button', { name: /Center on print area/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Visual dividers
// ---------------------------------------------------------------------------

describe('AlignmentToolbar — visual dividers', () => {
  it('renders divider spans before the distribute group and before center-on-print-area', () => {
    mockSelectedLayers = [{ id: 'a' }];
    const { container } = render(<AlignmentToolbar surface={fakeSurface} />);
    // Dividers are <span> elements that are aria-hidden
    const dividers = container.querySelectorAll('span[aria-hidden="true"]');
    expect(dividers.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// alignTo — via button clicks
// ---------------------------------------------------------------------------

describe('AlignmentToolbar — alignTo button clicks', () => {
  function setupSingleObjCanvas() {
    const obj = makeFabricObj(10, 20, 50, 30);
    const canvas = makeCanvas(null, [obj]);
    mockCanvas = canvas;
    mockSelectedLayers = [{ id: 'a' }];
    return { obj, canvas };
  }

  it('calls canvas.fire and requestRenderAll after clicking "Align left edges"', () => {
    const { canvas } = setupSingleObjCanvas();
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Align left edges/i }));
    expect(canvas.fire).toHaveBeenCalled();
    expect(canvas.requestRenderAll).toHaveBeenCalled();
  });

  it('calls obj.set after clicking "Align left edges"', () => {
    const { obj } = setupSingleObjCanvas();
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Align left edges/i }));
    expect(obj.set).toHaveBeenCalled();
  });

  it('calls canvas.fire and requestRenderAll after clicking "Align right edges"', () => {
    const { canvas } = setupSingleObjCanvas();
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Align right edges/i }));
    expect(canvas.fire).toHaveBeenCalled();
    expect(canvas.requestRenderAll).toHaveBeenCalled();
  });

  it('calls canvas.fire after clicking "Align horizontal centers"', () => {
    const { canvas } = setupSingleObjCanvas();
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Align horizontal centers/i }));
    expect(canvas.fire).toHaveBeenCalled();
  });

  it('calls canvas.fire after clicking "Align top edges"', () => {
    const { canvas } = setupSingleObjCanvas();
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Align top edges/i }));
    expect(canvas.fire).toHaveBeenCalled();
  });

  it('calls canvas.fire after clicking "Align bottom edges"', () => {
    const { canvas } = setupSingleObjCanvas();
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Align bottom edges/i }));
    expect(canvas.fire).toHaveBeenCalled();
  });

  it('calls canvas.fire after clicking "Align vertical centers"', () => {
    const { canvas } = setupSingleObjCanvas();
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Align vertical centers/i }));
    expect(canvas.fire).toHaveBeenCalled();
  });

  it('does nothing when canvas is null on align click', () => {
    mockCanvas = null;
    mockSelectedLayers = [{ id: 'a' }];
    // Should not throw
    render(<AlignmentToolbar surface={fakeSurface} />);
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: /Align left edges/i }))
    ).not.toThrow();
  });

  it('does nothing when getActiveObjects returns empty on align click', () => {
    mockCanvas = makeCanvas(null, []);
    mockSelectedLayers = [{ id: 'a' }];
    render(<AlignmentToolbar surface={fakeSurface} />);
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: /Align left edges/i }))
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// alignTo math — verify left/right/centerX/top/bottom/centerY positions
// ---------------------------------------------------------------------------

describe('AlignmentToolbar — alignTo math with two objects', () => {
  function setupTwoObjCanvas() {
    // obj1: left=10, top=20, w=50, h=30
    // obj2: left=80, top=60, w=40, h=20
    // union: minX=10, maxX=130, minY=20, maxY=80
    const obj1 = makeFabricObj(10, 20, 50, 30);
    const obj2 = makeFabricObj(80, 60, 40, 20);
    const canvas = makeCanvas(null, [obj1, obj2]);
    mockCanvas = canvas;
    mockSelectedLayers = [{ id: 'a' }, { id: 'b' }];
    return { obj1, obj2, canvas };
  }

  it('"Align left edges" sets both objects left to minX boundary', () => {
    const { obj1, obj2 } = setupTwoObjCanvas();
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Align left edges/i }));
    // obj1: b.left=10, dxLeft=10-10=0 → set left=10-0=10
    expect(obj1.set).toHaveBeenCalledWith(expect.objectContaining({ left: 10 }));
    // obj2: b.left=80, dxLeft=80-80=0 → set left=10-0=10
    expect(obj2.set).toHaveBeenCalledWith(expect.objectContaining({ left: 10 }));
  });

  it('"Align right edges" sets both objects to maxX boundary', () => {
    const { obj1, obj2 } = setupTwoObjCanvas();
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Align right edges/i }));
    // obj2 right edge: 80+40=120 → maxX=120
    // obj1: dxRight=b.left+b.width-left=10+50-10=50 → 120-50=70
    expect(obj1.set).toHaveBeenCalledWith(expect.objectContaining({ left: 70 }));
    // obj2: dxRight=80+40-80=40 → 120-40=80
    expect(obj2.set).toHaveBeenCalledWith(expect.objectContaining({ left: 80 }));
  });

  it('"Align top edges" sets both objects top to minY boundary', () => {
    const { obj1, obj2 } = setupTwoObjCanvas();
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Align top edges/i }));
    // minY=20; obj1: b.top=20, dyTop=0 → 20; obj2: b.top=60, dyTop=0 → 20
    expect(obj1.set).toHaveBeenCalledWith(expect.objectContaining({ top: 20 }));
    expect(obj2.set).toHaveBeenCalledWith(expect.objectContaining({ top: 20 }));
  });

  it('"Align bottom edges" sets both objects top so bottoms meet maxY', () => {
    const { obj1, obj2 } = setupTwoObjCanvas();
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Align bottom edges/i }));
    // maxY=80; obj1: dyBottom=b.top+b.height-top=20+30-20=30 → 80-30=50
    expect(obj1.set).toHaveBeenCalledWith(expect.objectContaining({ top: 50 }));
    // obj2: dyBottom=60+20-60=20 → 80-20=60
    expect(obj2.set).toHaveBeenCalledWith(expect.objectContaining({ top: 60 }));
  });

  it('"Align horizontal centers" aligns both to union centerX', () => {
    const { obj1, obj2 } = setupTwoObjCanvas();
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Align horizontal centers/i }));
    // maxX=120 (obj2 right: 80+40); unionCx=(10+120)/2=65
    // obj1: dxCenter=b.left+b.width/2-left=10+25-10=25 → 65-25=40
    expect(obj1.set).toHaveBeenCalledWith(expect.objectContaining({ left: 40 }));
    // obj2: dxCenter=80+20-80=20 → 65-20=45
    expect(obj2.set).toHaveBeenCalledWith(expect.objectContaining({ left: 45 }));
  });

  it('"Align vertical centers" aligns both to union centerY', () => {
    const { obj1, obj2 } = setupTwoObjCanvas();
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Align vertical centers/i }));
    // unionCy=(20+80)/2=50
    // obj1: dyCenter=b.top+b.height/2-top=20+15-20=15 → 50-15=35
    expect(obj1.set).toHaveBeenCalledWith(expect.objectContaining({ top: 35 }));
    // obj2: dyCenter=60+10-60=10 → 50-10=40
    expect(obj2.set).toHaveBeenCalledWith(expect.objectContaining({ top: 40 }));
  });
});

// ---------------------------------------------------------------------------
// alignTo — ActiveSelection path (active object has _objects)
// ---------------------------------------------------------------------------

describe('AlignmentToolbar — alignTo with ActiveSelection active object', () => {
  it('uses _objects from the active selection rather than getActiveObjects', () => {
    const obj1 = makeFabricObj(0, 0, 50, 50);
    const obj2 = makeFabricObj(100, 0, 50, 50);
    const activeSelection = {
      _objects: [obj1, obj2],
      setCoords: vi.fn(),
    };
    const canvas = makeCanvas(activeSelection, []);
    mockCanvas = canvas;
    mockSelectedLayers = [{ id: 'a' }, { id: 'b' }];
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Align left edges/i }));
    // getActiveObjects should NOT be called since _objects was used
    expect(canvas.getActiveObjects).not.toHaveBeenCalled();
    // Both objects should have been moved
    expect(obj1.set).toHaveBeenCalled();
    expect(obj2.set).toHaveBeenCalled();
  });

  it('calls setCoords on the active selection after alignment', () => {
    const obj1 = makeFabricObj(0, 0, 50, 50);
    const activeSelection = {
      _objects: [obj1],
      setCoords: vi.fn(),
    };
    const canvas = makeCanvas(activeSelection, []);
    mockCanvas = canvas;
    mockSelectedLayers = [{ id: 'a' }];
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Align top edges/i }));
    expect(activeSelection.setCoords).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// distribute
// ---------------------------------------------------------------------------

describe('AlignmentToolbar — distribute buttons', () => {
  function setupThreeObjCanvas() {
    // Horizontal: obj1 at x=0, obj2 at x=100, obj3 at x=200 (centers: 25, 120, 225)
    const obj1 = makeFabricObj(0, 0, 50, 50);
    const obj2 = makeFabricObj(100, 50, 40, 40);
    const obj3 = makeFabricObj(200, 0, 50, 50);
    const canvas = makeCanvas(null, [obj1, obj2, obj3]);
    mockCanvas = canvas;
    mockSelectedLayers = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    return { obj1, obj2, obj3, canvas };
  }

  it('"Distribute horizontally" fires canvas.fire for all 3 objects', () => {
    const { canvas } = setupThreeObjCanvas();
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Distribute horizontally/i }));
    // fire is called once per object (3 times)
    expect(canvas.fire).toHaveBeenCalledTimes(3);
    expect(canvas.requestRenderAll).toHaveBeenCalled();
  });

  it('"Distribute horizontally" moves the middle object to evenly-spaced position', () => {
    const { obj2 } = setupThreeObjCanvas();
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Distribute horizontally/i }));
    // first center: 0+50/2=25, last center: 200+50/2=225, step=(225-25)/(3-1)=100
    // middle target center: 25+100=125; obj2 center offset: b.left+b.width/2-left=100+20-100=20
    // → obj2.left = 125-20 = 105
    expect(obj2.set).toHaveBeenCalledWith(expect.objectContaining({ left: 105 }));
  });

  it('"Distribute vertically" fires canvas.fire for all 3 objects', () => {
    const { canvas } = setupThreeObjCanvas();
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Distribute vertically/i }));
    expect(canvas.fire).toHaveBeenCalledTimes(3);
    expect(canvas.requestRenderAll).toHaveBeenCalled();
  });

  it('"Distribute vertically" moves at least one middle object', () => {
    const { obj1, obj2, obj3 } = setupThreeObjCanvas();
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Distribute vertically/i }));
    // Sorted by vertical center: obj1(25), obj3(25), obj2(70).
    // Middle element (index 1 = obj3) gets set(); first and last are untouched by distribute.
    // Verify that exactly one of the three objects had set() called on it (the middle).
    const setCalls = [obj1.set.mock.calls.length, obj2.set.mock.calls.length, obj3.set.mock.calls.length];
    const totalSet = setCalls.reduce((a, b) => a + b, 0);
    expect(totalSet).toBe(1);
  });

  it('does nothing when canvas is null on distribute click', () => {
    mockCanvas = null;
    mockSelectedLayers = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    render(<AlignmentToolbar surface={fakeSurface} />);
    // distribute buttons are enabled (count=3) but canvas is null
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: /Distribute horizontally/i }))
    ).not.toThrow();
  });

  it('does nothing when getActiveObjects returns fewer than 3 even if count>=3', () => {
    const canvas = makeCanvas(null, [makeFabricObj(0, 0, 50, 50)]);
    mockCanvas = canvas;
    mockSelectedLayers = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Distribute horizontally/i }));
    // distribute guard: objs.length < 3 → return early
    expect(canvas.fire).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// centerOnPrintArea
// ---------------------------------------------------------------------------

describe('AlignmentToolbar — centerOnPrintArea', () => {
  it('moves object(s) so union center aligns with print-area center', () => {
    // obj at left=0, top=0, w=100, h=100 → union center=(50, 50)
    // print-area center=(0+200/2, 0+300/2)=(100, 150)
    // dx=50, dy=100 → obj ends up at left=50, top=100
    const obj = makeFabricObj(0, 0, 100, 100);
    const canvas = makeCanvas(null, [obj]);
    mockCanvas = canvas;
    mockSelectedLayers = [{ id: 'a' }];
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Center on print area/i }));
    expect(obj.set).toHaveBeenCalledWith(expect.objectContaining({ left: 50, top: 100 }));
    expect(canvas.fire).toHaveBeenCalled();
    expect(canvas.requestRenderAll).toHaveBeenCalled();
  });

  it('does nothing when surface is null', () => {
    const obj = makeFabricObj(0, 0, 100, 100);
    const canvas = makeCanvas(null, [obj]);
    mockCanvas = canvas;
    mockSelectedLayers = [{ id: 'a' }];
    // surface=null means button is disabled; click should be a no-op
    render(<AlignmentToolbar surface={null} />);
    const btn = screen.getByRole('button', { name: /Center on print area/i });
    fireEvent.click(btn);
    expect(obj.set).not.toHaveBeenCalled();
  });

  it('does nothing when canvas is null', () => {
    mockCanvas = null;
    mockSelectedLayers = [{ id: 'a' }];
    // surface provided but canvas null
    render(<AlignmentToolbar surface={fakeSurface} />);
    // button is enabled (surface present, count>=1) but canvas guard returns early
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: /Center on print area/i }))
    ).not.toThrow();
  });

  it('does nothing when getActiveObjects returns empty', () => {
    const canvas = makeCanvas(null, []);
    mockCanvas = canvas;
    mockSelectedLayers = [{ id: 'a' }];
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Center on print area/i }));
    expect(canvas.fire).not.toHaveBeenCalled();
  });

  it('calls setCoords on an ActiveSelection after centering', () => {
    const obj = makeFabricObj(0, 0, 100, 100);
    const activeSelection = { _objects: [obj], setCoords: vi.fn() };
    const canvas = makeCanvas(activeSelection, []);
    mockCanvas = canvas;
    mockSelectedLayers = [{ id: 'a' }];
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Center on print area/i }));
    expect(activeSelection.setCoords).toHaveBeenCalled();
  });

  it('centers a two-object selection on the print area', () => {
    // obj1: left=0, top=0, w=50, h=50; obj2: left=50, top=0, w=50, h=50
    // union: minX=0, maxX=100, minY=0, maxY=50 → center=(50, 25)
    // print-area center=(100, 150); dx=50, dy=125
    const obj1 = makeFabricObj(0, 0, 50, 50);
    const obj2 = makeFabricObj(50, 0, 50, 50);
    const canvas = makeCanvas(null, [obj1, obj2]);
    mockCanvas = canvas;
    mockSelectedLayers = [{ id: 'a' }, { id: 'b' }];
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Center on print area/i }));
    expect(obj1.set).toHaveBeenCalledWith(expect.objectContaining({ left: 50, top: 125 }));
    expect(obj2.set).toHaveBeenCalledWith(expect.objectContaining({ left: 100, top: 125 }));
  });
});

// ---------------------------------------------------------------------------
// obj.setCoords is called for each object via fireModified
// ---------------------------------------------------------------------------

describe('AlignmentToolbar — fireModified fires object:modified per object', () => {
  it('fires "object:modified" event once per object', () => {
    const obj1 = makeFabricObj(0, 0, 50, 50);
    const obj2 = makeFabricObj(60, 0, 50, 50);
    const canvas = makeCanvas(null, [obj1, obj2]);
    mockCanvas = canvas;
    mockSelectedLayers = [{ id: 'a' }, { id: 'b' }];
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Align left edges/i }));
    // fire called once per object = 2 times
    expect(canvas.fire).toHaveBeenCalledTimes(2);
    expect(canvas.fire).toHaveBeenCalledWith('object:modified', expect.objectContaining({ target: obj1 }));
    expect(canvas.fire).toHaveBeenCalledWith('object:modified', expect.objectContaining({ target: obj2 }));
  });

  it('calls setCoords on each object', () => {
    const obj1 = makeFabricObj(0, 0, 50, 50);
    const obj2 = makeFabricObj(60, 0, 50, 50);
    const canvas = makeCanvas(null, [obj1, obj2]);
    mockCanvas = canvas;
    mockSelectedLayers = [{ id: 'a' }, { id: 'b' }];
    render(<AlignmentToolbar surface={fakeSurface} />);
    fireEvent.click(screen.getByRole('button', { name: /Align left edges/i }));
    expect(obj1.setCoords).toHaveBeenCalled();
    expect(obj2.setCoords).toHaveBeenCalled();
  });
});

import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  it('starts with an empty toast queue', () => {
    expect(service.toasts()).toEqual([]);
  });

  it('show() adds a toast with the given message and action label', () => {
    service.show('Play logged!', 'Undo', () => {});
    const toasts = service.toasts();
    expect(toasts.length).toBe(1);
    expect(toasts[0].message).toBe('Play logged!');
    expect(toasts[0].actionLabel).toBe('Undo');
  });

  it('each toast gets a unique id', () => {
    service.show('First', 'OK', () => {});
    service.show('Second', 'OK', () => {});
    const [a, b] = service.toasts();
    expect(a.id).not.toBe(b.id);
  });

  it('dismiss() removes the toast with the matching id', () => {
    service.show('Msg', 'X', () => {});
    const id = service.toasts()[0].id;
    service.dismiss(id);
    expect(service.toasts()).toEqual([]);
  });

  it('dismiss() is a no-op for an unknown id', () => {
    service.show('Msg', 'X', () => {});
    service.dismiss(9999);
    expect(service.toasts().length).toBe(1);
  });

  it('auto-dismisses after the default duration', fakeAsync(() => {
    service.show('Auto', 'OK', () => {});
    expect(service.toasts().length).toBe(1);
    tick(5000);
    expect(service.toasts()).toEqual([]);
  }));

  it('auto-dismisses after a custom duration', fakeAsync(() => {
    service.show('Fast', 'OK', () => {}, 1000);
    tick(999);
    expect(service.toasts().length).toBe(1);
    tick(1);
    expect(service.toasts()).toEqual([]);
  }));

  it('onAction callback is stored and callable', () => {
    let fired = false;
    service.show('Msg', 'Undo', () => { fired = true; });
    service.toasts()[0].onAction();
    expect(fired).toBeTrue();
  });

  it('multiple toasts are queued and dismissed independently', fakeAsync(() => {
    service.show('A', 'X', () => {}, 1000);
    service.show('B', 'X', () => {}, 3000);
    expect(service.toasts().length).toBe(2);

    tick(1000);
    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].message).toBe('B');

    tick(2000);
    expect(service.toasts()).toEqual([]);
  }));
});

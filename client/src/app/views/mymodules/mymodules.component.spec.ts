import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MymodulesComponent } from './mymodules.component';

describe('MymodulesComponent', () => {
  let component: MymodulesComponent;
  let fixture: ComponentFixture<MymodulesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MymodulesComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MymodulesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

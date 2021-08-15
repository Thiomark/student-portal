import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-select',
  templateUrl: './select.component.html',
  styleUrls: ['./select.component.scss']
})
export class SelectComponent implements OnInit {

  isMenuOn: boolean = false

  toggleMenu(){
    this.isMenuOn = !this.isMenuOn
  }

  constructor() { }

  ngOnInit(): void {
  }

}
